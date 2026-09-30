import { capyChat } from "@/lib/server/ai-core.server";
import { configValue } from "@/lib/server/secrets";
import {
  NOTE,
  cleanNote,
  deliverCommunityNote,
  ensureCommunityTable,
  telegramCreds,
} from "@/lib/server/telegram";

type TgMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number; username?: string };
  from?: { is_bot?: boolean; id?: number };
};

function sameRoom(chat: string, message: TgMessage) {
  const id = message.chat?.id != null ? String(message.chat.id) : "";
  const name = message.chat?.username ? `@${message.chat.username}` : "";
  return chat === id || chat.toLowerCase() === name.toLowerCase();
}

export async function runTelegramPulse() {
  const { token, chat } = await telegramCreds();
  if (!token || !chat || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: true as const, skipped: "not configured" };
  const sql = await ensureCommunityTable();
  const today = await sql<{ n: number }>`
    select count(*)::int as n from community_notes
    where status = 'sent' and sent_at > date_trunc('day', now() at time zone 'utc')
  `;
  if ((today[0]?.n ?? 0) >= 6) return { ok: true as const, skipped: "daily cap" };
  const recent = await sql<{ sent_at: string | null }>`
    select sent_at from community_notes where status = 'sent' order by sent_at desc nulls last limit 1
  `;
  const last = recent[0]?.sent_at ? new Date(recent[0].sent_at).getTime() : 0;
  if (last && Date.now() - last < 20 * 60 * 1000) return { ok: true as const, skipped: "too soon" };

  const offsetRows = await sql<{ value: string }>`select value from protocol_config where key = 'telegram_update_offset' limit 1`;
  const offset = Number(offsetRows[0]?.value) || 0;
  let updates: { update_id: number; message?: TgMessage }[] = [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offset, timeout: 0, allowed_updates: ["message"] }),
    });
    const json = (await res.json()) as { ok?: boolean; result?: { update_id: number; message?: TgMessage }[] };
    updates = json.ok && Array.isArray(json.result) ? json.result : [];
  } catch {
    updates = [];
  }
  let maxId = offset;
  for (const update of updates) {
    if (update.update_id >= maxId) maxId = update.update_id + 1;
    const message = update.message;
    const text = message?.text?.trim() ?? "";
    if (message?.from?.id && text.startsWith("/start")) {
      const { recordTelegramStart } = await import("@/lib/server/airdrop");
      await recordTelegramStart(text, String(message.from.id));
    }
    const source = message?.message_id ? String(message.message_id) : "";
    if (!message || message.from?.is_bot || !text || !source || !sameRoom(chat, message)) continue;
    if (text.startsWith("/")) continue;
    const seen = await sql<{ id: number }>`select id from community_notes where source_message_id = ${source} limit 1`;
    if (seen[0]) continue;
    const reply = await capyChat(
      `${NOTE}\nReply to this message from the room. One or two sentences. Do not repeat their words back as a slogan.\nMessage: ${text.slice(0, 400)}`,
      220,
      NOTE,
      "maya:telegram",
    );
    const cleaned = reply.ok ? cleanNote(reply.text) : null;
    if (!cleaned) continue;
    await sql`
      insert into community_notes (platform, content, status, kind, source_message_id)
      values ('telegram', ${cleaned}, 'queued', 'reply', ${source})
    `;
  }
  if (maxId !== offset) {
    await sql`
      insert into protocol_config (key, value) values ('telegram_update_offset', ${String(maxId)})
      on conflict (key) do update set value = excluded.value
    `;
  }
  const on = (await configValue("telegram_auto_on")) ?? "true";
  if (on === "false") return { ok: true as const, skipped: "paused" };

  const queued = await sql<{ id: number; source_message_id: string | null }>`
    select id, source_message_id from community_notes
    where status = 'queued' and kind = 'reply'
    order by created_at asc
    limit 1
  `;
  if (queued[0]) return deliverCommunityNote(queued[0].id);

  const lastNote = await sql<{ sent_at: string | null }>`
    select sent_at from community_notes where status = 'sent' and kind = 'note' order by sent_at desc nulls last limit 1
  `;
  const lastNoteAt = lastNote[0]?.sent_at ? new Date(lastNote[0].sent_at).getTime() : 0;
  if (lastNoteAt && Date.now() - lastNoteAt < 4 * 60 * 60 * 1000) return { ok: true as const, skipped: "room is quiet" };
  const prior = await sql<{ content: string }>`select content from community_notes order by created_at desc limit 5`;
  const drafted = await capyChat(
    `${NOTE}\nDo not repeat:\n${prior.map((r) => r.content).join("\n") || "(none)"}\nAsk one useful question about launching or trading on Zenze.`,
    220,
    NOTE,
    "maya:telegram",
  );
  const text = drafted.ok ? cleanNote(drafted.text) : null;
  if (!text) return { ok: false as const, error: "Maya had nothing safe to send." };
  const rows = await sql<{ id: number }>`
    insert into community_notes (platform, content, status, kind)
    values ('telegram', ${text}, 'queued', 'note')
    returning id
  `;
  return deliverCommunityNote(rows[0].id);
}
