import { isHexAddress } from "@/lib/intent";
import { publishedConfig } from "@/lib/onchain";
import { capyChat } from "@/lib/server/ai-core.server";
import { announcementDue, announcementText, jakartaDayStart } from "@/lib/server/telegram-posts";
import { configValue } from "@/lib/server/secrets";
import {
  NOTE,
  cleanNote,
  deliverCommunityNote,
  ensureCommunityTable,
  telegramCreds,
  COMMUNITY_GROUP,
  COMMUNITY_GROUP_URL,
  publicRoomUrl,
} from "@/lib/server/telegram";

type TgMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number; username?: string };
  from?: { is_bot?: boolean; id?: number };
};

function sameRoom(chat: string, message: TgMessage) {
  const id = message.chat?.id != null ? String(message.chat.id) : "";
  const name = (message.chat?.username ?? "").toLowerCase();
  const targets = [chat, `@${COMMUNITY_GROUP}`, COMMUNITY_GROUP];
  return targets.some((target) => {
    const bare = target.replace(/^@/, "").toLowerCase();
    return target === id || target.toLowerCase() === `@${name}` || bare === name;
  });
}

export async function runTelegramPulse() {
  const { token, chat } = await telegramCreds();
  if (!token || !chat || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: true as const, skipped: "not configured" };
  const sql = await ensureCommunityTable();
  const dayStart = jakartaDayStart(new Date()).toISOString();
  const announces = await sql<{ n: number }>`
    select count(*)::int as n from community_notes
    where status = 'sent' and kind = 'announce' and sent_at >= ${dayStart}::timestamptz
  `;
  const replies = await sql<{ n: number }>`
    select count(*)::int as n from community_notes
    where status = 'sent' and kind = 'reply' and sent_at >= ${dayStart}::timestamptz
  `;
  const sentAnnouncements = announces[0]?.n ?? 0;
  const sentReplies = replies[0]?.n ?? 0;

  const offsetRows = await sql<{ value: string }>`select value from protocol_config where key = 'telegram_update_offset' limit 1`;
  const offset = Number(offsetRows[0]?.value) || 0;
  let updates: { update_id: number; message?: TgMessage; channel_post?: TgMessage }[] = [];
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offset, timeout: 0, allowed_updates: ["message", "channel_post"] }),
    });
    const json = (await res.json()) as { ok?: boolean; result?: { update_id: number; message?: TgMessage; channel_post?: TgMessage }[] };
    updates = json.ok && Array.isArray(json.result) ? json.result : [];
  } catch {
    updates = [];
  }
  let maxId = offset;
  for (const update of updates) {
    if (update.update_id >= maxId) maxId = update.update_id + 1;
    const message = update.message ?? update.channel_post;
    const text = message?.text?.trim() ?? "";
    if (message?.from?.id && text.startsWith("/start")) {
      const { recordTelegramStart } = await import("@/lib/server/airdrop");
      await recordTelegramStart(text, String(message.from.id));
      const room = await publicRoomUrl();
      const linked = /join_0x[a-fA-F0-9]{40}/i.test(text);
      const reply = linked
        ? `Start received.\n\nJoin the group. The points count once you are in it.\n${COMMUNITY_GROUP_URL}\n\nAnnouncements are in the channel.\n${room}`
        : `Open https://zenzen.fun/airdrop and tap Start so your wallet is attached.\n\nJoin the group.\n${COMMUNITY_GROUP_URL}\n\nAnnouncements are in the channel.\n${room}`;
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: message.chat?.id,
            text: reply.trim(),
            reply_to_message_id: message.message_id,
            disable_web_page_preview: false,
          }),
        });
      } catch {
        // A missed welcome must not stop the announcement slot.
      }
    }
    const source = message?.message_id ? String(message.message_id) : "";
    if (!message || message.from?.is_bot || !text || !source || !sameRoom(chat, message)) continue;
    if (text.startsWith("/")) continue;
    const seen = await sql<{ id: number }>`select id from community_notes where source_message_id = ${source} limit 1`;
    if (seen[0]) continue;
    const reply = await capyChat(
      `${NOTE}\nAnswer this message from the room in one or two sentences. Do not ask a question. Do not repeat their words back as a slogan.\nMessage: ${text.slice(0, 400)}`,
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

  if (sentReplies < 8) {
    const queued = await sql<{ id: number; source_message_id: string | null }>`
      select id, source_message_id from community_notes
      where status = 'queued' and kind = 'reply'
      order by created_at asc
      limit 1
    `;
    if (queued[0]) return deliverCommunityNote(queued[0].id);
  }

  const lastNote = await sql<{ sent_at: string | null }>`
    select sent_at from community_notes
    where status = 'sent' and kind = 'announce'
    order by sent_at desc nulls last
    limit 1
  `;
  const lastNoteAt = lastNote[0]?.sent_at ? new Date(lastNote[0].sent_at).getTime() : 0;
  if (!announcementDue(sentAnnouncements, lastNoteAt, new Date())) return { ok: true as const, skipped: "not a slot" };
  const addr = publishedConfig().znzf_robinhood ?? "";
  const znzfUrl = isHexAddress(addr) ? `https://zenzen.fun/token/${addr.toLowerCase()}` : "https://zenzen.fun/znzf";
  const day = Math.floor((Date.now() + 7 * 60 * 60 * 1000) / 86_400_000);
  const text = cleanNote(announcementText(day * 5 + sentAnnouncements, znzfUrl));
  if (!text) return { ok: false as const, error: "The announcement was not safe to send." };
  const rows = await sql<{ id: number }>`
    insert into community_notes (platform, content, status, kind)
    values ('telegram', ${text}, 'queued', 'announce')
    returning id
  `;
  return deliverCommunityNote(rows[0]!.id);
}
