import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { operatorMiddleware } from "@/lib/operator-middleware";
import { capyChat } from "@/lib/server/ai-core.server";
import { configValue } from "@/lib/server/secrets";

export const NOTE =
  "Write one Telegram message for the Zenze community. Sound like a person in the group, not an advertisement. Ask one question or answer one thing. Do not mention fees, percentages, contract addresses, or wallets. Do not say the project is not Robinhood or Circle. Do not ask for a seed phrase. If a link is needed, use exactly one https://zenze.fun/ path. No hashtags.";

export function cleanNote(raw: string): string | null {
  const text = raw.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").slice(0, 700);
  if (text.length < 20) return null;
  if (/seed phrase|private key|guaranteed|100x|to the moon|buy now|not affiliated/i.test(text)) return null;
  if (/0x[a-fA-F0-9]{40}/.test(text)) return null;
  if (/http:\/\//i.test(text)) return null;
  if (/\bzenze\.fun\b/i.test(text) && !/https:\/\/zenze\.fun\//i.test(text)) return null;
  return text;
}

export async function telegramCreds() {
  const token = (await configValue("telegram_bot_token"))?.trim() ?? "";
  const chat = (await configValue("telegram_chat_id"))?.trim() ?? "";
  return { token, chat };
}

async function telegramCall(token: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { ok?: boolean; description?: string; result?: { id?: number; username?: string; title?: string } };
  if (!json.ok) throw new Error(json.description || "Telegram did not accept that.");
  return json.result ?? {};
}

export async function ensureCommunityTable() {
  const sql = await getSql();
  await sql`
    create table if not exists community_notes (
      id bigserial primary key,
      platform text not null default 'telegram',
      content text not null,
      status text not null default 'draft',
      telegram_message_id text,
      created_at timestamptz not null default now(),
      sent_at timestamptz
    )
  `;
  await sql`alter table community_notes add column if not exists kind text not null default 'note'`;
  await sql`alter table community_notes add column if not exists source_message_id text`;
  return sql;
}

export async function deliverCommunityNote(id: number, replyTo?: number) {
  const { token, chat } = await telegramCreds();
  if (!token || !chat) return { ok: false as const, error: "Add the Telegram bot token and chat id in Settings first." };
  const sql = await ensureCommunityTable();
  const rows = await sql<{ id: number; content: string; status: string; source_message_id: string | null }>`
    select id, content, status, source_message_id from community_notes where id = ${id} limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, error: "That note is gone." };
  if (row.status === "sent") return { ok: true as const, sent: true, id: row.id };
  const text = cleanNote(row.content);
  if (!text) return { ok: false as const, error: "That note is not safe to send." };
  const reply = replyTo ?? Number(row.source_message_id);
  try {
    const sent = await telegramCall(token, "sendMessage", {
      chat_id: chat,
      text,
      disable_web_page_preview: false,
      ...(Number.isFinite(reply) && reply > 0 ? { reply_to_message_id: reply } : {}),
    });
    const messageId = sent.id ? String(sent.id) : "";
    await sql`
      update community_notes
         set status = 'sent', telegram_message_id = ${messageId}, sent_at = now(), content = ${text}
       where id = ${row.id}
    `;
    return { ok: true as const, sent: true, id: row.id };
  } catch (err) {
    await sql`update community_notes set status = 'failed' where id = ${row.id}`;
    return { ok: false as const, error: err instanceof Error ? err.message : "Telegram refused the message." };
  }
}

export const telegramDesk = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const { token, chat } = await telegramCreds();
    let bot = "";
    let room = "";
    let error = "";
    if (token && /^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
      try {
        const me = await telegramCall(token, "getMe");
        bot = me.username ? `@${me.username}` : "connected";
        if (chat) {
          const info = await telegramCall(token, "getChat", { chat_id: chat });
          room = info.title || info.username || chat;
        }
      } catch (err) {
        error = err instanceof Error ? err.message : "Telegram is not reachable.";
      }
    }
    const sql = await ensureCommunityTable();
    const notes = await sql<{ id: number; content: string; status: string; created_at: string; sent_at: string | null }>`
      select id, content, status, created_at, sent_at
      from community_notes
      order by created_at desc
      limit 20
    `;
    return { ready: Boolean(bot && chat && !error), bot, room, error, notes, auto: ((await configValue("telegram_auto_on")) ?? "true") !== "false" };
  });

export const draftCommunityNote = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { hint?: string }) => input)
  .handler(async ({ data, context }) => {
    const hint = (data.hint ?? "").trim().slice(0, 240);
    const sql = await ensureCommunityTable();
    const recent = await sql<{ content: string }>`select content from community_notes order by created_at desc limit 5`;
    const avoid = recent.map((r) => r.content).join("\n");
    const drafted = await capyChat(
      `${NOTE}\nDo not repeat:\n${avoid || "(none)"}\nHint: ${hint || "Ask the group what they want to launch next."}`,
      280,
      NOTE,
      "maya:telegram",
    );
    if (!drafted.ok) return drafted;
    const text = cleanNote(drafted.text);
    if (!text) return { ok: false as const, error: "Maya drafted something that does not belong in the community room." };
    const rows = await sql<{ id: number }>`
      insert into community_notes (platform, content, status, kind)
      values ('telegram', ${text}, 'queued', 'note')
      returning id
    `;
    const id = rows[0]?.id ?? 0;
    const sent = await deliverCommunityNote(id);
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'telegram_send', ${String(id)})`;
    if (!sent.ok) return sent;
    return { ok: true as const, id, text, sent: true };
  });

export const sendCommunityNote = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ data, context }) => {
    const sql = await ensureCommunityTable();
    const sent = await deliverCommunityNote(data.id);
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'telegram_send', ${String(data.id)})`;
    return sent;
  });

export const discardCommunityNote = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ data, context }) => {
    const sql = await ensureCommunityTable();
    await sql`update community_notes set status = 'discarded' where id = ${data.id} and status <> 'sent'`;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'telegram_discard', ${String(data.id)})`;
    return { ok: true as const };
  });
