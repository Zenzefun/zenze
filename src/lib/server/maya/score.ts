import type { MayaActionKind, MayaCta, MayaJob, MayaRisk } from "./policy.ts";
import { hasTruncatedUrl, isMillDump } from "./shape.ts";

export type ScoreCtx = {
  facts: string;
  action: MayaActionKind;
  job?: MayaJob;
  segment?: string;
  audience?: string;
  mentionedUs?: boolean;
  isOurPost?: boolean;
};

export type ScoreResult = {
  ok: boolean;
  score: number;
  reasons: string[];
  risk: MayaRisk;
};

const TOXIC =
  /\b(to the moon|100x|guaranteed|ape now|secret sauce|private key|seed phrase|wagmi army|buy now before|buy now|risk-?free|cannot fail|will graduate|you will profit|get rich|easy money|can't lose|official partner(?:ship)? of robinhood|partnered with robinhood|insider fill|insider alloc)\b/i;

const SLOP = /\b(leverage|synergy|unleash|game-changing|gm we building|like and rt|huge announcement tomorrow)\b/i;

const FAKE_TRACTION = /\b(\d[\d,]*)\s*(holders?|volume|mcap|market cap)\b/i;

const TEMPLATE =
  /\b(i'd rather|i would rather|glad you(?:'re| are) here|fair offer|nothing to sign up|just collecting real questions)\b/i;

const HASHTAG_SOUP = /(?:#[a-z0-9]+){3,}/i;

export function brandToxic(text: string) {
  return TOXIC.test(text);
}

export function scoreDraft(text: string, ctx: ScoreCtx): ScoreResult {
  const reasons: string[] = [];
  let score = 70;
  const t = text.trim();
  const action = ctx.action;
  const writing = action === "original" || action === "quote" || action === "reply" || action === "repost";

  if (writing && t.length < 12) {
    return { ok: false, score: 0, reasons: ["empty draft"], risk: "high" };
  }
  if (writing && t.length > 280) {
    score -= 25;
    reasons.push("over 280");
  }
  if (brandToxic(t)) {
    return { ok: false, score: 0, reasons: ["brand-toxic or illegal promo"], risk: "high" };
  }
  if (writing && action === "original" && isMillDump(t)) {
    return { ok: false, score: 0, reasons: ["mill dump"], risk: "high" };
  }
  if (writing && hasTruncatedUrl(t)) {
    return { ok: false, score: 0, reasons: ["truncated URL"], risk: "high" };
  }
  if (/https?:\/\/(?:www\.)?zenze\.fun/i.test(t) || /\bzenze\.fun\b/i.test(t)) {
    return { ok: false, score: 0, reasons: ["zenze.fun is hidden on X"], risk: "high" };
  }
  if ((action === "original" || action === "quote") && /https?:\/\//i.test(t)) {
    return { ok: false, score: 0, reasons: ["originals carry no link"], risk: "high" };
  }
  if ((action === "original" || action === "quote") && /^@\w/.test(t)) {
    return { ok: false, score: 0, reasons: ["opens with @, so only mutuals see it"], risk: "high" };
  }
  if (writing && TEMPLATE.test(t)) {
    return { ok: false, score: 0, reasons: ["repeated pitch template"], risk: "high" };
  }
  if (SLOP.test(t)) {
    score -= 30;
    reasons.push("slop voice");
  }
  if (HASHTAG_SOUP.test(t)) {
    score -= 20;
    reasons.push("hashtag soup");
  }

  const urls = t.match(/https?:\/\/[^\s]+/g) ?? [];
  if (urls.length > 1) {
    score -= 15;
    reasons.push("more than one URL");
  }
  if (urls.length > 2) {
    return { ok: false, score: Math.min(score, 40), reasons: [...reasons, "link dump"], risk: "high" };
  }
  if (/check this pad|frens\s*👇/i.test(t)) {
    score -= 25;
    reasons.push("shill CTA");
  }
  if (urls.some((u) => !/linktr\.ee\/zenzefun|x\.com\//i.test(u)) && action !== "quote") {
    score -= 10;
    reasons.push("off-site URL");
  }

  const facts = ctx.facts.toLowerCase();
  const traction = t.match(FAKE_TRACTION);
  if (traction) {
    const blob = traction[0].toLowerCase();
    if (!facts.includes(blob) && !facts.includes(traction[1] ?? "___nomatch___")) {
      score -= 40;
      reasons.push("ungrounded traction number");
    }
  }

  if ((action === "original" || action === "quote") && t.length > 0 && t.length <= 240) {
    score += 5;
  }
  if (action === "original" && !/\$znzf/i.test(t) && /znzf|protocol token|canonical/i.test(ctx.audience ?? "")) {
    score -= 8;
    reasons.push("protocol post missing $ZNZF");
  }
  if (action === "reply" && /have you tried zenze\.fun/i.test(t)) {
    return { ok: false, score: 0, reasons: ["banned reply pattern"], risk: "high" };
  }
  if (action === "reply" && urls.length > 0 && !ctx.mentionedUs && !ctx.isOurPost) {
    score -= 20;
    reasons.push("first-touch reply with a link");
  }
  if (!ctx.job) {
    score -= 15;
    reasons.push("no conversion job");
  }
  if (!ctx.segment) {
    score -= 10;
    reasons.push("no segment");
  }
  if (!ctx.audience) {
    score -= 8;
    reasons.push("no audience");
  }

  const grounded =
    !writing ||
    t
      .toLowerCase()
      .split(/[^a-z0-9.$]+/)
      .filter((w) => w.length >= 4)
      .some((w) => facts.includes(w) || /zenze|znzf|robinhood|bonding|curve|uniswap|capy/.test(w));
  if (writing && !grounded) {
    score -= 25;
    reasons.push("not grounded in facts or product nouns");
  }

  let risk: MayaRisk = "low";
  if (action === "like" || action === "follow") risk = action === "like" ? "high" : "medium";
  if (action === "reply" && !ctx.mentionedUs && !ctx.isOurPost) risk = "high";
  else if (action === "reply") risk = "medium";
  if (action === "quote" || action === "repost") risk = "medium";
  if (/buy (now|this)|price target/i.test(t)) {
    risk = "high";
    score -= 40;
    reasons.push("buy language");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const ok = score >= 55 && !brandToxic(t);
  if (!ok && reasons.length === 0) reasons.push("below bar");
  return { ok, score, reasons, risk };
}

export function normalizeCta(raw: unknown): MayaCta {
  if (raw === "question" || raw === "deep_link") return raw;
  return "none";
}
