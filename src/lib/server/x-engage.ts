import { getSql } from "@/lib/db";
import { configValue } from "@/lib/server/secrets";
import { searchTweets, type XMention } from "@/lib/server/twitterapis";

export type EngageKind = "like" | "follow" | "repost" | "comment";

export type EngageCounts = {
  like: number;
  follow: number;
  repost: number;
  comment: number;
};

export const DAILY_CAPS: EngageCounts = {
  like: 8,
  follow: 24,
  repost: 6,
  comment: 12,
};

/** Promo bots on the mention river: DM pitches, collab offers, paid boosts, empty hype. */
const SPAM =
  /\b(giveaway|airdrop wallet|double your|follow back|followback|follow me|please follow|dm me|dm for|d\.m\. me|check (your |my )?dms?\b|kindly\b|\bdms?\b|message me|for free|seed phrase|private key|connect wallet here|pump it|collab\w*|boost\b|promo\b|promotion services|let'?s talk|let'?s connect|worth a chat|discuss via|send us|f4f|follow 4 follow)\b/i;

const FLUFF =
  /\b(huge potential|this idea stands out|love what you.?re building|great concept|the wait was worth it|time to move this|got a few ways|more visibility)\b/i;

const LEFTOVER =
  /\$zena\b|@zenalabs|zenze\.fun\/airdrop|pomodoro-to-earn|labor.?mission|points-based airdrop/i;

function capFromConfig(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(80, Math.max(0, Math.round(n)));
}

export function isRiverSpam(text: string, username = "") {
  return SPAM.test(text) || SPAM.test(username) || FLUFF.test(text) || LEFTOVER.test(text) || LEFTOVER.test(username);
}

export async function loadCaps(): Promise<EngageCounts> {
  const [like, follow, repost, comment] = await Promise.all([
    configValue("x_daily_likes"),
    configValue("x_daily_follows"),
    configValue("x_daily_reposts"),
    configValue("x_daily_comments"),
  ]);
  return {
    like: capFromConfig(like, DAILY_CAPS.like),
    follow: capFromConfig(follow, DAILY_CAPS.follow),
    repost: capFromConfig(repost, DAILY_CAPS.repost),
    comment: capFromConfig(comment, DAILY_CAPS.comment),
  };
}

export async function countsToday(): Promise<EngageCounts> {
  const empty: EngageCounts = { like: 0, follow: 0, repost: 0, comment: 0 };
  try {
    const sql = await getSql();
    const rows = await sql<{ kind: string; n: number }>`
      select kind, count(*)::int as n from marketing_actions
       where status = 'ok' and created_at > date_trunc('day', now())
       group by kind
    `;
    const out = { ...empty };
    for (const row of rows) {
      if (row.kind === "like" || row.kind === "follow" || row.kind === "repost" || row.kind === "comment") {
        out[row.kind] = row.n;
      }
    }
    return out;
  } catch {
    return empty;
  }
}

function minutesLeftUtc() {
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(25, (end - now.getTime()) / 60000);
}

/** Pace remaining quota across the rest of the UTC day. Hard cap 2 per kind per pulse. */
export function pulseBudget(done: number, cap: number, tickMin = 5) {
  const remaining = Math.max(0, cap - done);
  if (remaining <= 0) return 0;
  const pulsesLeft = Math.max(1, Math.ceil(minutesLeftUtc() / tickMin));
  const fair = remaining / pulsesLeft;
  if (fair >= 1.4) return Math.min(2, remaining);
  if (fair >= 1) return 1;
  return Math.random() < Math.min(1, fair) ? 1 : 0;
}

export async function alreadyActed(kind: EngageKind, targetId: string) {
  const id = targetId.trim();
  if (!id) return true;
  try {
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from marketing_actions
       where kind = ${kind} and target_id = ${id}
    `;
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function alreadyFollowed(username: string, userId?: string) {
  const handle = username.replace(/^@/, "").toLowerCase();
  if (!handle) return true;
  try {
    const sql = await getSql();
    const id = (userId ?? "").trim();
    const rows = id
      ? await sql<{ n: number }>`
          select count(*)::int as n from marketing_actions
           where kind = 'follow'
             and (lower(target_user) = ${handle} or target_id = ${`user:${handle}`} or target_id = ${id})
        `
      : await sql<{ n: number }>`
          select count(*)::int as n from marketing_actions
           where kind = 'follow'
             and (lower(target_user) = ${handle} or target_id = ${`user:${handle}`})
        `;
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function recordAction(input: {
  kind: EngageKind;
  targetId: string;
  targetUser?: string;
  tweetId?: string | null;
  status: "ok" | "failed";
  error?: string;
}) {
  try {
    const sql = await getSql();
    await sql`
      insert into marketing_actions (kind, target_id, target_user, tweet_id, status, error)
      values (
        ${input.kind},
        ${input.targetId},
        ${input.targetUser ?? ""},
        ${input.tweetId ?? null},
        ${input.status},
        ${input.error ?? null}
      )
      on conflict (kind, target_id) do nothing
    `;
  } catch {
    // table may not exist yet
  }
}

function skipAccount(username: string, text = "") {
  const u = username.replace(/^@/, "").toLowerCase();
  if (!u || u === "unknown" || u === "zenzefun") return true;
  if (isRiverSpam(text, username)) return true;
  return false;
}

export function inZenzeRiver(text: string, tickers: string[] = []) {
  if (isRiverSpam(text)) return false;
  const t = text.toLowerCase();
  if (/\$znzf\b|zenze\.fun|@zenzefun|\bzenze\b/.test(t)) return true;
  for (const sym of tickers) {
    const s = sym.replace(/^\$/, "").toLowerCase();
    if (!s || s.length < 2) continue;
    if (t.includes(`$${s}`) && /(zenze|bonding curve|robinhood chain|uniswap v4)/i.test(text)) return true;
  }
  return false;
}

/** Comment only on a real question or a river post that already has some engagement. */
export function commentWorthy(p: XMention, handle: string) {
  if (p.author.toLowerCase() === handle.replace(/^@/, "").toLowerCase()) return false;
  if (skipAccount(p.author, p.text)) return false;
  if (isRiverSpam(p.text, p.author)) return false;
  if (/(\?|how |what |where |wen |fee|launch|curve|bridge|swap|znzf|zenze)/i.test(p.text)) return true;
  return p.likes >= 2 && inZenzeRiver(p.text);
}

async function liveTickers(sql: Awaited<ReturnType<typeof getSql>>) {
  try {
    const rows = await sql<{ symbol: string }>`
      select symbol from tokens
       where id <> 'znzf' and created_at > now() - interval '14 days'
       order by created_at desc
       limit 8
    `;
    return rows.map((r) => r.symbol.replace(/^\$/, "")).filter(Boolean);
  } catch {
    return [] as string[];
  }
}

export async function collectRiver(handle: string): Promise<{ tweets: XMention[]; tickers: string[] }> {
  const sql = await getSql();
  const tickers = await liveTickers(sql);
  const cashtags = tickers.slice(0, 5).map((s) => `$${s}`).join(" OR ");
  const query = cashtags
    ? `($ZNZF OR @${handle} OR Zenze.fun OR "Zenze fun") OR (${cashtags} (Zenze OR "bonding curve" OR "Robinhood Chain"))`
    : `$ZNZF OR @${handle} OR Zenze.fun OR "Zenze fun"`;
  const tweets = await searchTweets(query);
  const mine = handle.replace(/^@/, "").toLowerCase();
  const seen = new Set<string>();
  const filtered = tweets.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    if (p.author.toLowerCase() === mine) return false;
    if (skipAccount(p.author, p.text)) return false;
    return inZenzeRiver(p.text, tickers);
  });
  return { tweets: filtered, tickers };
}

/**
 * Graph writes are planned by Maya and gated. This helper only reports
 * remaining comment budget so older callers do not spray likes/follows.
 */
export async function runSilentEngagement(_handle: string): Promise<{
  done: EngageCounts;
  caps: EngageCounts;
  applied: EngageCounts;
  commentSlots: number;
}> {
  const caps = await loadCaps();
  const done = await countsToday();
  const applied: EngageCounts = { like: 0, follow: 0, repost: 0, comment: 0 };
  const commentSlots = pulseBudget(done.comment, caps.comment);
  return { done, caps, applied, commentSlots };
}

export async function markComment(tweetId: string, author: string) {
  await recordAction({
    kind: "comment",
    targetId: tweetId,
    targetUser: author,
    tweetId,
    status: "ok",
  });
}
