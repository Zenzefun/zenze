import { getSql } from "@/lib/db";
import { alreadyActed, alreadyFollowed, markComment, recordAction } from "@/lib/server/x-engage";
import { favoriteTweet, followUser, retweetTweet } from "@/lib/server/twitterapis";
import { publishTweet } from "@/lib/server/x";
import { DAILY_CAPS } from "./policy";
import { scoreDraft } from "./score";
import { freezeGraph, touchContact } from "./learn";
import { hasTruncatedUrl, isMillDump, shapePost } from "./shape";
import type { MayaItem } from "./plan";
import type { ObservePack } from "./observe";
import { mentionIsQuestion } from "./observe";

export type PulsePlay = "launch" | "znzf" | "fact" | "reply" | "quote" | "engage" | "skip";

export type ActResult = {
  play: PulsePlay;
  posted: boolean;
  skipped?: string;
  text?: string;
  id?: number;
  xPostId?: string;
  error?: string;
  queued: number;
};

export function itemFromQueueRow(row: {
  action: string;
  job: string;
  risk: string;
  segment: string;
  audience: string;
  reason: string;
  draft: string;
  handle: string;
  post_id: string;
  url: string;
  payload?: unknown;
}): MayaItem {
  const extra = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Partial<MayaItem>;
  return {
    action: row.action as MayaItem["action"],
    job: (row.job as MayaItem["job"]) || "A1",
    risk: (row.risk as MayaItem["risk"]) || "high",
    segment: row.segment,
    audience: row.audience,
    reason: row.reason,
    draft: extra.draft || row.draft || "",
    post_id: row.post_id,
    handle: row.handle,
    url: row.url,
    cta: extra.cta ?? "none",
    score_hint: extra.score_hint ?? 0,
    why_this_account: extra.why_this_account ?? "",
    what_we_will_say_if_they_post: extra.what_we_will_say_if_they_post ?? "",
    value_we_add_with_no_link: extra.value_we_add_with_no_link ?? "",
    whether_zenze_belongs: extra.whether_zenze_belongs ?? false,
  };
}

function playOf(item: MayaItem, obs: ObservePack): PulsePlay {
  if (item.action === "reply") return "reply";
  if (item.action === "quote") return "quote";
  if (obs.newestLaunch && item.action === "original") {
    const sym = obs.newestLaunch.symbol.toLowerCase();
    if (item.draft.toLowerCase().includes(sym)) return "launch";
  }
  if (item.job === "A6") return "znzf";
  if (item.action === "original") return "fact";
  return "engage";
}

export async function enqueue(item: MayaItem, status: "pending" | "executed" = "pending") {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into marketing_queue (action, job, risk, segment, audience, reason, draft, handle, post_id, url, payload, status)
      values (
        ${item.action},
        ${item.job},
        ${item.risk},
        ${item.segment},
        ${item.audience},
        ${item.reason},
        ${item.draft},
        ${item.handle},
        ${item.post_id},
        ${item.url},
        ${JSON.stringify(item)}::jsonb,
        ${status}
      )
      returning id
    `;
    return rows[0]?.id ?? 0;
  } catch {
    return 0;
  }
}

/** Leftover mill originals in the old approval pile do not ship. */
export async function rejectMillQueue() {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: number; action: string; draft: string }>`
      select id, action, draft from marketing_queue where status = 'pending' limit 40
    `;
    for (const row of rows) {
      if (row.action === "original" && (isMillDump(row.draft) || hasTruncatedUrl(row.draft))) {
        await sql`
          update marketing_queue
             set status = 'rejected', error = 'mill dump', resolved_at = now()
           where id = ${row.id}
        `;
      }
    }
  } catch {
    // table may not exist yet
  }
}

async function savePost(input: {
  play: PulsePlay;
  text: string;
  status: "posted" | "queued" | "failed";
  research: string;
  xPostId: string | null;
  replyTo: string | null;
  tokenId?: string | null;
  item: MayaItem;
  provider: string;
}) {
  const sql = await getSql();
  try {
    const rows = await sql<{ id: number }>`
      insert into marketing_posts (kind, content, status, request, research, x_post_id, published_at, provider, model, play, reply_to, token_id, job, segment, risk, audience)
      values (
        'auto',
        ${input.text},
        ${input.status},
        ${`maya:${input.play}:${input.item.job}`},
        ${input.research},
        ${input.xPostId},
        ${input.status === "posted" ? new Date().toISOString() : null},
        ${input.provider},
        ${input.provider},
        ${input.play},
        ${input.replyTo},
        ${input.tokenId ?? null},
        ${input.item.job},
        ${input.item.segment},
        ${input.item.risk},
        ${input.item.audience}
      )
      returning id
    `;
    return rows[0]?.id ?? 0;
  } catch {
    const rows = await sql<{ id: number }>`
      insert into marketing_posts (kind, content, status, request, research, x_post_id, published_at, provider, model, play, reply_to, token_id)
      values (
        'auto',
        ${input.text},
        ${input.status},
        ${`maya:${input.play}:${input.item.job}`},
        ${input.research},
        ${input.xPostId},
        ${input.status === "posted" ? new Date().toISOString() : null},
        ${input.provider},
        ${input.provider},
        ${input.play},
        ${input.replyTo},
        ${input.tokenId ?? null}
      )
      returning id
    `;
    return rows[0]?.id ?? 0;
  }
}

function mentionedUs(item: MayaItem, obs: ObservePack) {
  if (item.post_id && obs.mentions.some((m) => m.id === item.post_id)) return true;
  const hit = obs.weather.find((m) => m.id === item.post_id);
  if (!hit) return false;
  return /@zenzefun|\$znzf|zenze\.fun|\bzenze\b/i.test(hit.text);
}

function isOurThreadReply(item: MayaItem, obs: ObservePack) {
  return item.action === "reply" && Boolean(item.post_id) && obs.mentions.some((m) => m.id === item.post_id);
}

function writingKind(action: MayaItem["action"]): "original" | "reply" | "quote" | null {
  if (action === "original" || action === "reply" || action === "quote") return action;
  return null;
}

function shapeItem(item: MayaItem): MayaItem {
  const kind = writingKind(item.action);
  if (!kind) return item;
  return { ...item, draft: shapePost(item.draft, kind) };
}

function canExecute(item: MayaItem, obs: ObservePack, originalDue: boolean): string | null {
  if (obs.freezeUntil > Date.now() && item.action !== "original") {
    return "Graph freeze — owned originals only.";
  }
  if (item.action === "like") {
    if (!item.post_id) return "Like needs a post id.";
    if (!item.reason) return "Like needs a reason.";
    if (obs.done.like >= Math.min(obs.caps.like, DAILY_CAPS.like)) return "Like cap reached.";
    return null;
  }
  if (item.action === "follow") {
    if (!obs.autoFollows) return "Follows paused.";
    if (obs.done.follow >= Math.min(obs.caps.follow, DAILY_CAPS.follow)) return "Follow cap reached.";
    if (!item.handle || item.score_hint < 4) return "Follow needs a named 4–5 account.";
    if (!item.why_this_account) return "Follow card incomplete.";
    return null;
  }
  if (item.action === "quote") {
    if (!obs.autoQuotes) return "Quotes paused.";
    if (!item.draft) return "Quote needs copy.";
    return null;
  }
  if (item.action === "repost") {
    if (!item.post_id) return "Repost needs a post id.";
    if (obs.done.repost >= Math.min(obs.caps.repost, DAILY_CAPS.repost)) return "Repost cap reached.";
    return null;
  }
  if (item.action === "original") {
    if (!originalDue && !obs.newestLaunch) return "Original cadence not due.";
    if (obs.originalsToday >= DAILY_CAPS.original) return "Daily original cap reached.";
    if (!item.draft) return "Empty original.";
    if (isMillDump(item.draft) || hasTruncatedUrl(item.draft)) return "Mill dump — not a shaped post.";
    return null;
  }
  if (item.action === "reply") {
    if (obs.done.comment >= Math.min(obs.caps.comment, DAILY_CAPS.comment)) return "Comment cap reached.";
    if (!obs.autoReplies) return "Replies paused.";
    if (!item.draft) return "Empty reply.";
    if (!item.post_id) return "Reply needs the post it answers. A loose reply becomes a hidden original.";
    const optIn = mentionedUs(item, obs) || isOurThreadReply(item, obs);
    if (!optIn) return "Cold first-touch skipped.";
    return null;
  }
  return "Not executable this pulse.";
}

async function publishOriginal(item: MayaItem, obs: ObservePack, play: PulsePlay): Promise<ActResult> {
  const scored = scoreDraft(item.draft, {
    facts: obs.factsText,
    action: item.action,
    job: item.job,
    segment: item.segment,
    audience: item.audience,
    mentionedUs: mentionedUs(item, obs),
    isOurPost: isOurThreadReply(item, obs),
  });
  if (!scored.ok) {
    return { play, posted: false, error: `Draft failed score (${scored.score}): ${scored.reasons.join("; ")}`, queued: 0 };
  }
  const replyTo = item.action === "reply" ? item.post_id || undefined : undefined;
  const quoteTo = item.action === "quote" ? item.post_id || undefined : undefined;
  const posted = await publishTweet(item.draft, replyTo, quoteTo);
  const status = posted.ok ? "posted" : "failed";
  if (!posted.ok && /429/.test(posted.error)) await freezeGraph(24);
  const tokenId = play === "launch" ? obs.newestLaunch?.id ?? null : null;
  const id = await savePost({
    play,
    text: item.draft,
    status,
    research: obs.factsText,
    xPostId: posted.ok ? posted.id : null,
    replyTo: replyTo ?? null,
    tokenId,
    item,
    provider: "maya",
  });
  if (posted.ok && item.handle) {
    await touchContact({
      handle: item.handle,
      segment: item.segment,
      action: item.action,
      topic: item.draft.slice(0, 160),
      temperature: item.action === "reply" ? "hot" : "warm",
    });
  }
  if (posted.ok && replyTo) await markComment(replyTo, item.handle);
  if (posted.ok && item.action === "original" && posted.id) {
    await publishTweet("The page is here.\nhttps://linktr.ee/zenzefun", posted.id).catch(() => null);
  }
  if (posted.ok) return { play, posted: true, text: item.draft, id, xPostId: posted.id, queued: 0 };
  return { play, posted: false, text: item.draft, id, error: posted.error, queued: 0 };
}

export async function executeItem(item: MayaItem, obs: ObservePack): Promise<ActResult> {
  const shaped = shapeItem(item);
  if (shaped.action === "like" && shaped.post_id) {
    if (await alreadyActed("like", shaped.post_id)) {
      return { play: "engage", posted: false, skipped: "Already liked.", queued: 0 };
    }
    const res = await favoriteTweet(shaped.post_id);
    if (res.ok) {
      await recordAction({ kind: "like", targetId: shaped.post_id, targetUser: shaped.handle, tweetId: shaped.post_id, status: "ok" });
      return { play: "engage", posted: false, skipped: `Liked @${shaped.handle}.`, queued: 0 };
    }
    if (res.status === 429) await freezeGraph(24);
    return { play: "engage", posted: false, error: res.error, queued: 0 };
  }
  if (shaped.action === "follow") {
    if (await alreadyFollowed(shaped.handle)) {
      return { play: "engage", posted: false, skipped: "Already followed.", queued: 0 };
    }
    const res = await followUser({ username: shaped.handle });
    if (res.ok) {
      await recordAction({ kind: "follow", targetId: `user:${shaped.handle.toLowerCase()}`, targetUser: shaped.handle, status: "ok" });
      await touchContact({
        handle: shaped.handle,
        segment: shaped.segment,
        action: "follow",
        topic: shaped.why_this_account,
        temperature: "cold",
      });
      return { play: "engage", posted: false, skipped: `Followed @${shaped.handle}.`, queued: 0 };
    }
    if (res.status === 429) await freezeGraph(24);
    return { play: "engage", posted: false, error: res.error, queued: 0 };
  }
  if (shaped.action === "repost" && shaped.post_id) {
    if (await alreadyActed("repost", shaped.post_id)) {
      return { play: "engage", posted: false, skipped: "Already reposted.", queued: 0 };
    }
    const res = await retweetTweet(shaped.post_id);
    if (res.ok) {
      await recordAction({ kind: "repost", targetId: shaped.post_id, targetUser: shaped.handle, tweetId: shaped.post_id, status: "ok" });
      return { play: "engage", posted: false, skipped: "Reposted.", queued: 0 };
    }
    return { play: "engage", posted: false, error: res.error, queued: 0 };
  }
  return publishOriginal(shaped, obs, playOf(shaped, obs));
}

function preferLaunchDraft(obs: ObservePack, items: MayaItem[]): MayaItem[] {
  if (!obs.newestLaunch) return items;
  const sym = obs.newestLaunch.symbol.toLowerCase();
  return [...items].sort((a, b) => {
    const as = a.action === "original" && a.draft.toLowerCase().includes(sym) ? 0 : 1;
    const bs = b.action === "original" && b.draft.toLowerCase().includes(sym) ? 0 : 1;
    return as - bs;
  });
}

export async function act(plan: { items: MayaItem[] }, obs: ObservePack): Promise<ActResult> {
  const originalDue = obs.originalsToday < DAILY_CAPS.original && obs.minutesSinceOriginal >= obs.cadenceMin;
  const items = preferLaunchDraft(obs, plan.items.map(shapeItem));
  let wrote = false;
  let followed = false;
  let liked = false;
  let executed: ActResult | null = null;

  for (const item of items) {
    const writing = Boolean(writingKind(item.action));
    if (writing) {
      if (isMillDump(item.draft) && item.action === "original") continue;
      const scored = scoreDraft(item.draft, {
        facts: obs.factsText,
        action: item.action,
        job: item.job,
        segment: item.segment,
        audience: item.audience,
        mentionedUs: mentionedUs(item, obs),
        isOurPost: isOurThreadReply(item, obs),
      });
      if (!scored.ok) continue;
    }
    if (item.action === "reply" && item.post_id && (await alreadyActed("comment", item.post_id))) continue;
    const block = canExecute(item, obs, originalDue || Boolean(obs.newestLaunch));
    if (block) continue;

    if (item.action === "follow") {
      if (followed) continue;
      const result = await executeItem(item, obs);
      followed = true;
      if (!executed) executed = result;
      continue;
    }
    if (item.action === "like" || item.action === "repost") {
      if (liked) continue;
      const result = await executeItem(item, obs);
      liked = true;
      if (!executed) executed = result;
      continue;
    }
    if (writing) {
      if (wrote) continue;
      executed = await executeItem(item, obs);
      wrote = true;
    }
  }

  if (executed) return { ...executed, queued: 0 };

  const q = obs.mentions.find((p) => mentionIsQuestion(p, obs.handle));
  if (q && obs.autoReplies && obs.done.comment < obs.caps.comment && !(await alreadyActed("comment", q.id))) {
    return {
      play: "skip",
      posted: false,
      skipped: "Inbound question this window — Maya did not draft a reply. No mill fallback.",
      queued: 0,
    };
  }

  return {
    play: "skip",
    posted: false,
    skipped: originalDue
      ? "Planner produced nothing executable. No mill fallback."
      : `Next original in ${Math.ceil(Math.max(0, obs.cadenceMin - obs.minutesSinceOriginal))}m.`,
    queued: 0,
  };
}

