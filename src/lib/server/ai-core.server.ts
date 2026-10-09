import { getSql } from "@/lib/db";
import { GRADUATION_ETH, TRADE_FEE_BPS } from "@/lib/chains";
import { asNumber, formatUsdMaybe } from "@/lib/format";
import { fetchEthUsd } from "@/lib/quotes.server";
export { fetchEthUsd };
import { SITE } from "@/lib/seo";
import { configValue } from "@/lib/server/secrets";
import type { TokenRow } from "@/lib/types";
import { pickChatText, systemForKind, useCapyMemory } from "./ai-text";
import { enrichToken } from "./market";

export const ZENZE_SYSTEM_PROMPT = `You are Capy, the zen capybara mascot of Zenzen — an AI-powered token launchpad.
The native token of Zenzen is $ZNZF. Pronounce it "Zin-zef". Official X: ${SITE.handle} (${SITE.x}).
Tagline: Launch a token. Trade it back.

Brand voice:
- No hype. Say what a person can do.
- Fee math and pool rules belong in the docs, not in a greeting.
- Use nature metaphors (water, rocks, leaves, campfires) when they help.
- Use only the figures provided. Never invent holders, volume, or price.
- Tweets must stay under 240 characters unless a thread is requested.
- Sign the voice as Capy, not as a press office.
- Always write the token as "$ZNZF" with dollar sign in marketing content.
- Emojis allowed sparingly: max 2, only from 🌿 ♨️

Forbidden:
- "to the moon", "100x", "guaranteed", "ape now", "secret", "insider"
- Panic, fear, fake urgency
- Operator desk, private keys, cookies, relayers, kitchen
- Invented traction

Keep replies under 160 words unless asked for a thread.`;

export const DEEPSEEK_MODEL = "deepseek-flash";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };

export type ChatOk = { ok: true; text: string; provider: string };
export type ChatErr = { ok: false; error: string };

function publicApiError(status: number): string {
  if (status === 401 || status === 403) return "The desk could not reach the model. Try again in a moment.";
  if (status === 429) return "The onsen is crowded. Wait a few seconds.";
  return `The onsen steam thickened (${status}).`;
}

async function postChat(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  json = false,
): Promise<ChatOk | ChatErr> {
  const tokens = json ? Math.max(maxTokens, 2048) : Math.max(maxTokens, 640);

  async function send(body: Record<string, unknown>) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
  }

  function basePayload(withJson: boolean, thinkingOff: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = { model, max_tokens: tokens, messages };
    if (withJson) payload.response_format = { type: "json_object" };
    if (thinkingOff) {
      payload.thinking = { type: "disabled" };
      payload.reasoning_effort = "none";
    }
    return payload;
  }

  async function once(payload: Record<string, unknown>): Promise<{ status: number; text: string; finish: string }> {
    const res = await send(payload);
    if (!res.ok) {
      let hint = "";
      try {
        hint = (await res.text()).slice(0, 180);
      } catch {
        hint = "";
      }
      return { status: res.status, text: "", finish: hint };
    }
    const body = (await res.json()) as {
      choices?: { finish_reason?: string; message?: { content?: unknown; reasoning_content?: unknown } }[];
    };
    const choice = body.choices?.[0];
    return { status: 200, text: pickChatText(choice?.message), finish: String(choice?.finish_reason ?? "") };
  }

  let payload = basePayload(json, true);
  let r = await once(payload);

  if (r.status === 400) {
    payload = basePayload(json, false);
    r = await once(payload);
  }
  if (r.status === 400 && json) {
    payload = { model, max_tokens: tokens, messages };
    r = await once(payload);
  }
  if (r.status === 200 && !r.text && json) {
    r = await once({ model, max_tokens: Math.max(tokens, 2048), messages });
  }
  if (r.status !== 200) return { ok: false, error: publicApiError(r.status) };
  if (!r.text) return { ok: false, error: "The model returned an empty answer." };
  return { ok: true, text: r.text, provider: model };
}

export async function chat(
  user: string | ChatPart[],
  maxTokens = 420,
  extraSystem = "",
  kind = "chat",
): Promise<ChatOk | ChatErr> {
  const memory = await loadMemory();
  const system = systemForKind(kind, extraSystem, ZENZE_SYSTEM_PROMPT);
  const memBlock = useCapyMemory(kind) && memory.length
    ? `\n\nLight memory (learned, keep using unless the operator overrides):\n${memory.map((m) => `- ${m}`).join("\n")}`
    : "";
  const messages: ChatMessage[] = [
    { role: "system", content: system + memBlock },
    { role: "user", content: user },
  ];

  const deepseek = await configValue("deepseek_api_key");
  const xai = await configValue("xai_api_key");
  const json = kind.startsWith("maya");
  const tryModel = async (provider: string, url: string, key: string, model: string) => {
    try {
      const r = await postChat(url, key, model, messages, maxTokens, json);
      await logJob(provider, model, kind, r.ok ? "ok" : "error", r.ok ? r.text : r.error);
      return r;
    } catch (err) {
      const error = err instanceof Error ? err.message : "The model did not answer.";
      await logJob(provider, model, kind, "error", error);
      return { ok: false as const, error };
    }
  };
  if (deepseek) {
    const r = await tryModel("deepseek", "https://api.deepseek.com/chat/completions", deepseek, DEEPSEEK_MODEL);
    if (r.ok) return { ...r, provider: "deepseek" };
  }
  if (xai) {
    const r = await tryModel("xai", "https://api.x.ai/v1/chat/completions", xai, "grok-4.5");
    if (r.ok) return { ...r, provider: "xai" };
    return r;
  }
  await logJob("none", "none", kind, "error", "No AI key configured.");
  return { ok: false, error: "That draft is not available right now." };
}

async function logJob(provider: string, model: string, kind: string, status: string, detail: string) {
  try {
    const sql = await getSql();
    await sql`
      insert into ai_jobs (provider, model, kind, status, detail)
      values (${provider}, ${model}, ${kind}, ${status}, ${detail.trim().slice(0, 2000)})
    `;
  } catch {
    // table may not exist yet
  }
}

async function loadMemory(): Promise<string[]> {
  try {
    const sql = await getSql();
    const rows = await sql<{ content: string }>`
      select content from ai_memory order by created_at desc limit 12
    `;
    return rows.map((r) => r.content).filter(Boolean);
  } catch {
    return [];
  }
}

export async function remember(kind: string, content: string) {
  const text = content.trim().slice(0, 400);
  if (!text) return;
  const sql = await getSql();
  await sql`insert into ai_memory (kind, content) values (${kind}, ${text})`;
  await sql`
    delete from ai_memory where id not in (
      select id from ai_memory order by created_at desc limit 24
    )
  `;
}

export async function researchDesk() {
  const sql = await getSql();
  const ethUsd = await fetchEthUsd();
  const tokens = await sql<TokenRow>`select * from tokens order by created_at desc limit 8`;
  const recent = tokens.map((t) => {
    const e = enrichToken(t, { ethUsd });
    return `$${t.symbol} on ${t.chain} pair ${e.quote.pair} · holders ${t.holders} · health ${t.health_score} · mcap ${formatUsdMaybe(e.mcap)} · id ${t.id} · contract ${t.contract_address ?? ""}`;
  });
  const posts = await sql<{ content: string; status: string }>`
    select content, status from marketing_posts order by created_at desc limit 6
  `;
  const vol = await sql<{ v: string | number }>`
    select coalesce(sum(base_amount), 0) as v from trades where created_at > now() - interval '24 hours'
  `;
  const launched = await sql<{ n: number }>`select count(*)::int as n from tokens where id <> 'znzf'`;
  return {
    ethUsd,
    launched: launched[0]?.n ?? 0,
    volumeNative: asNumber(vol[0]?.v),
    tokens: recent,
    lastPosts: posts.map((p) => `[${p.status}] ${p.content.slice(0, 160)}`),
    curveFeePct: TRADE_FEE_BPS / 100,
    graduationEth: GRADUATION_ETH,
  };
}

export async function capyChat(
  user: string,
  maxTokens = 420,
  extraSystem = "",
  kind = "chat",
): Promise<ChatOk | ChatErr> {
  return chat(user, maxTokens, extraSystem, kind);
}
