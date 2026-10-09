import { getSql } from "@/lib/db";
import { asNumber } from "@/lib/format";
import { researchDesk } from "@/lib/server/ai-core.server";
import { configValue } from "@/lib/server/secrets";
import { fetchMentions, searchTweets, type XMention } from "@/lib/server/twitterapis";
import { countsToday, isRiverSpam, loadCaps } from "@/lib/server/x-engage";
import { DAILY_CAPS, SEARCH_SEEDS } from "./policy";
import { ownDomainOn } from "@/lib/server/x-door";
import { themeFor, urlForTheme } from "./calendar";
import { loadMemoryPack } from "./learn";
import { plannerFacts } from "./facts";
import { launchNeedles } from "./shape";
import { jakartaDayStart } from "@/lib/server/telegram-posts";

export type LaunchRipple = {
  id: string;
  name: string;
  symbol: string;
  contract_address: string | null;
  quote_asset: string | null;
};

export type ObservePack = {
  handle: string;
  facts: string[];
  factsText: string;
  launched: number;
  volumeNative: number;
  ethUsd: number | null;
  graduated: number;
  newestLaunch: LaunchRipple | null;
  mentions: XMention[];
  weather: XMention[];
  weatherQuery: string;
  theme: ReturnType<typeof themeFor>;
  originalsToday: number;
  minutesSinceOriginal: number;
  cadenceMin: number;
  originalCap: number;
  caps: Awaited<ReturnType<typeof loadCaps>>;
  done: Awaited<ReturnType<typeof countsToday>>;
  autoReplies: boolean;
  autoFollows: boolean;
  autoQuotes: boolean;
  ownDomain: boolean;
  followsThisHour: number;
  freezeUntil: number;
  memory: Awaited<ReturnType<typeof loadMemoryPack>>;
  gaps: string[];
};

function clampMinutes(raw: string | undefined) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 45;
  return Math.min(180, Math.max(20, Math.round(n)));
}

export function originalCapFrom(raw: string | undefined) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DAILY_CAPS.original;
  return Math.min(12, Math.max(0, Math.round(n)));
}

function flagOn(raw: string | undefined) {
  return (raw ?? "true") !== "false" && raw !== "0" && raw !== "off";
}

export async function alreadyCovered(sql: Awaited<ReturnType<typeof getSql>>, needle: string) {
  const n = needle.trim().toLowerCase().slice(0, 80);
  if (!n) return false;
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from marketing_posts
    where created_at > now() - interval '36 hours'
      and (lower(content) like ${"%" + n + "%"} or lower(coalesce(reply_to,'')) = ${n})
  `;
  return (rows[0]?.n ?? 0) > 0;
}

export async function originalsToday(sql: Awaited<ReturnType<typeof getSql>>) {
  const dayStart = jakartaDayStart(new Date());
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from marketing_posts
    where status = 'posted'
      and created_at >= ${dayStart}
      and coalesce(kind, '') <> 'listing'
      and coalesce(play, '') not in ('reply', 'engage', 'like', 'follow')
  `;
  return rows[0]?.n ?? 0;
}

export async function minutesSinceLastOriginal(sql: Awaited<ReturnType<typeof getSql>>) {
  const rows = await sql<{ created_at: string }>`
    select created_at from marketing_posts
    where status = 'posted'
      and coalesce(kind, '') <> 'listing'
      and coalesce(play, '') not in ('reply', 'engage', 'like', 'follow')
    order by created_at desc limit 1
  `;
  if (!rows[0]) return 9999;
  return (Date.now() - new Date(rows[0].created_at).getTime()) / 60000;
}

async function newestUnpostedLaunch(sql: Awaited<ReturnType<typeof getSql>>): Promise<LaunchRipple | null> {
  const rows = await sql<LaunchRipple>`
    select id, name, symbol, contract_address, quote_asset
      from tokens
     where id <> 'znzf'
       and created_at > now() - interval '8 hours'
     order by created_at desc
     limit 6
  `;
  for (const t of rows) {
    let covered = false;
    for (const needle of launchNeedles(t.symbol, t.contract_address)) {
      if (await alreadyCovered(sql, needle)) {
        covered = true;
        break;
      }
    }
    if (covered) continue;
    return t;
  }
  return null;
}

async function followsThisHour(sql: Awaited<ReturnType<typeof getSql>>) {
  try {
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from marketing_actions
      where status = 'ok' and kind = 'follow' and created_at > now() - interval '1 hour'
    `;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

export async function observe(handle: string): Promise<ObservePack> {
  const sql = await getSql();
  const factsPack = await researchDesk();
  const [graduatedRows, launch, today, since, caps, done, memory, followsHour] = await Promise.all([
    sql<{ n: number }>`select count(*)::int as n from tokens where graduated = true`,
    newestUnpostedLaunch(sql),
    originalsToday(sql),
    minutesSinceLastOriginal(sql),
    loadCaps(),
    countsToday(),
    loadMemoryPack(),
    followsThisHour(sql),
  ]);

  const autoReplies = flagOn(await configValue("x_auto_replies_on_our_posts"));
  const autoFollows = flagOn(await configValue("x_auto_follows"));
  const autoQuotes = flagOn(await configValue("x_auto_quotes"));
  const wantMentions = autoReplies && done.comment < caps.comment;
  const wantRiver = autoQuotes || done.like < caps.like || (autoFollows && done.follow < caps.follow) || done.repost < caps.repost;
  const seedIdx = Math.floor(Date.now() / (5 * 60 * 1000)) % SEARCH_SEEDS.length;
  const weatherQuery = SEARCH_SEEDS[seedIdx]!;
  const [mentions, weatherRaw] = await Promise.all([
    wantMentions ? fetchMentions(handle) : Promise.resolve([] as XMention[]),
    wantRiver
      ? searchTweets(weatherQuery).catch(() => [] as XMention[])
      : Promise.resolve([] as XMention[]),
  ]);
  const weather = weatherRaw.filter((p) => !isRiverSpam(p.text, p.author)).slice(0, 8);

  const theme = themeFor();
  const factsText = plannerFacts({
    launched: factsPack.launched,
    graduated: graduatedRows[0]?.n ?? 0,
    volumeNative: asNumber(factsPack.volumeNative),
    curveFeePct: factsPack.curveFeePct,
    graduationEth: factsPack.graduationEth,
    lastPosts: factsPack.lastPosts,
    tokenLines: factsPack.tokens,
    newestLaunch: launch ? { symbol: launch.symbol, name: launch.name } : null,
    themeName: theme.name,
    themeIntent: theme.intent,
    themeJob: theme.job,
    themeUrl: urlForTheme(theme),
  });

  const gaps = [
    "No profile-click or site-session pixel wired into this pulse. Do not invent funnel numbers.",
    "Likes: at most one planned like per pulse, never a firehose. Cold first-touch is skipped.",
    done.like + done.follow + done.repost === 0 && today === 0
      ? "Early account. Prefer owned originals over graph actions."
      : "",
  ].filter(Boolean);

  return {
    handle,
    facts: factsText.split("\n"),
    factsText,
    launched: factsPack.launched,
    volumeNative: asNumber(factsPack.volumeNative),
    ethUsd: factsPack.ethUsd,
    graduated: graduatedRows[0]?.n ?? 0,
    newestLaunch: launch,
    mentions: mentions.filter((p) => p.author.toLowerCase() !== handle.toLowerCase() && !isRiverSpam(p.text, p.author)),
    weather,
    weatherQuery,
    theme,
    originalsToday: today,
    minutesSinceOriginal: since,
    cadenceMin: clampMinutes(await configValue("x_auto_minutes")),
    originalCap: originalCapFrom(await configValue("x_daily_originals")),
    caps,
    done,
    autoReplies,
    autoFollows,
    autoQuotes,
    ownDomain: await ownDomainOn(),
    followsThisHour: followsHour,
    freezeUntil: memory.freezeUntil,
    memory,
    gaps,
  };
}

export function mentionIsQuestion(p: { author: string; text: string }, handle: string) {
  if (p.author.toLowerCase() === handle.toLowerCase()) return false;
  if (isRiverSpam(p.text, p.author)) return false;
  return /(\?|how |what |where |wen |fee|launch|curve|bridge|swap|znzf|zenze)/i.test(p.text);
}

/** The model often writes the answer and forgets the id. Pin it to the person who is waiting. */
export function attachWaitingReply<T extends { action: string; post_id: string; handle: string }>(
  item: T,
  mentions: { id: string; author: string; text: string }[],
  handle: string,
): T {
  if (item.action !== "reply") return item;
  const waiting = mentions.find((p) => mentionIsQuestion(p, handle));
  if (!waiting) return item;
  if (mentions.some((m) => m.id === item.post_id)) return item;
  return { ...item, post_id: waiting.id, handle: item.handle || waiting.author };
}

export function weatherOnSegment(p: XMention) {
  if (isRiverSpam(p.text, p.author)) return false;
  return /(fair launch|bonding curve|presale|sniper|robinhood chain|launchpad|where should i launch)/i.test(p.text);
}
