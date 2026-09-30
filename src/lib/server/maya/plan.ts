import { JOBS, SEGMENTS, type MayaActionKind, type MayaJob, type MayaRisk } from "./policy.ts";
import { extractJsonObject } from "./json.ts";
import { normalizeCta } from "./score.ts";
import { shapePost } from "./shape.ts";

export type MayaItem = {
  action: MayaActionKind;
  job: MayaJob;
  risk: MayaRisk;
  segment: string;
  audience: string;
  reason: string;
  draft: string;
  post_id: string;
  handle: string;
  url: string;
  cta: "none" | "question" | "deep_link";
  score_hint: number;
  why_this_account: string;
  what_we_will_say_if_they_post: string;
  value_we_add_with_no_link: string;
  whether_zenze_belongs: boolean;
};

export type MayaPlan = {
  strategy: string;
  bottleneck: string;
  note: string;
  items: MayaItem[];
  raw: string;
};

const JOBS_SET = new Set(Object.keys(JOBS) as MayaJob[]);
const SEG_SET = new Set(SEGMENTS.map((s) => s.id));
const ACTIONS = new Set<MayaActionKind>(["original", "quote", "reply", "follow", "like", "repost", "skip"]);

function str(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function parseItem(raw: unknown): MayaItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const action = str(o.action) as MayaActionKind;
  if (!ACTIONS.has(action) || action === "skip") return null;
  const job = (str(o.job) || "A1") as MayaJob;
  const risk = (str(o.risk) || "high") as MayaRisk;
  const segment = str(o.segment);
  return {
    action,
    job: JOBS_SET.has(job) ? job : "A1",
    risk: risk === "low" || risk === "medium" || risk === "high" ? risk : "high",
    segment: SEG_SET.has(segment) ? segment : segment.slice(0, 32),
    audience: str(o.audience).slice(0, 200),
    reason: str(o.reason).slice(0, 400),
    draft: (action === "original" || action === "quote" || action === "reply")
      ? shapePost(str(o.draft).slice(0, 800), action === "original" ? "original" : action)
      : str(o.draft).slice(0, 800),
    post_id: str(o.post_id).slice(0, 80),
    handle: str(o.handle).replace(/^@/, "").slice(0, 32),
    url: str(o.url).slice(0, 240),
    cta: normalizeCta(o.cta),
    score_hint: Math.max(0, Math.min(5, Number(o.score_hint) || 0)),
    why_this_account: str(o.why_this_account).slice(0, 280),
    what_we_will_say_if_they_post: str(o.what_we_will_say_if_they_post).slice(0, 280),
    value_we_add_with_no_link: str(o.value_we_add_with_no_link).slice(0, 280),
    whether_zenze_belongs: o.whether_zenze_belongs === true,
  };
}

export function parsePlan(raw: string): MayaPlan | null {
  const obj = extractJsonObject(raw);
  if (!obj) return null;
  const items = Array.isArray(obj.items) ? obj.items.map(parseItem).filter((x): x is MayaItem => Boolean(x)) : [];
  return {
    strategy: str(obj.strategy).slice(0, 800) || "Stay precise. One audience. No fake traction.",
    bottleneck: str(obj.bottleneck).slice(0, 400) || "Unclear.",
    note: str(obj.note).slice(0, 1200),
    items: items.slice(0, 6),
    raw,
  };
}
