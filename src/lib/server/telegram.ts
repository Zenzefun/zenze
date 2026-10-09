import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { operatorMiddleware } from "@/lib/operator-middleware";
import { capyChat } from "@/lib/server/ai-core.server";
import { cleanNote } from "@/lib/server/telegram-posts";
import { configValue } from "@/lib/server/secrets";

export const NOTE =
  "Write one Telegram announcement for Zenzen. Four short lines. Line 1 is the result. Name one product: a pool, a token, $ZNZF, points, the bridge, or a vote. No question. No fee percentage. No contract address. No wallet. No seed phrase. No hashtags. Points live at https://zenzen.fun/airdrop. There is no /points page. Stake is https://zenzen.fun/staking. If a link is needed, use exactly one of those real paths on its own line.";

export { cleanNote };

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
  const json = (await res.json()) as {
    ok?: boolean;
    description?: string;
    result?: { id?: number; message_id?: number; username?: string; title?: string };
  };
  if (!json.ok) throw new Error(json.description || "Telegram did not accept that.");
  return json.result ?? {};
}

export const COMMUNITY_GROUP = "zenzefun";
export const COMMUNITY_GROUP_URL = "https://t.me/zenzefun";

export async function publicRoomUrl() {
  const { token, chat } = await telegramCreds();
  if (!chat) return "";
  if (chat.startsWith("@")) return `https://t.me/${chat.slice(1)}`;
  if (!token) return "";
  try {
    const info = await telegramCall(token, "getChat", { chat_id: chat });
    if (info.username) return `https://t.me/${info.username}`;
  } catch {
    return "";
  }
  return "";
}

export async function ensureCommunityTable() {
  return getSql();
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
    const messageId = sent.message_id ? String(sent.message_id) : sent.id ? String(sent.id) : "";
    await sql`
      update community_notes
         set status = 'sent', telegram_message_id = ${messageId}, sent_at = now(), content = ${text}
       where id = ${row.id}
    `;
    await telegramCall(token, "sendMessage", {
      chat_id: `@${COMMUNITY_GROUP}`,
      text,
      disable_web_page_preview: false,
    }).catch(() => null);
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
      `${NOTE}\nDo not repeat:\n${avoid || "(none)"}\nHint: ${hint || "Tell the room one thing they can do today."}`,
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
