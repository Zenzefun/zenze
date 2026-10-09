export const DESK_DEFAULTS = {
  originals: 2,
  minutes: 45,
  like: 8,
  follow: 24,
  repost: 6,
  comment: 12,
} as const;

export type LimitRow = {
  key: "x_daily_originals" | "x_auto_minutes" | "x_daily_likes" | "x_daily_follows" | "x_daily_reposts" | "x_daily_comments";
  label: string;
  today: string;
  value: string;
  min: number;
  max: number;
};

export function deskLimits(input: {
  today?: number;
  originalCap?: number;
  minutes?: number;
  quotas?: Partial<Record<"like" | "follow" | "repost" | "comment", { done?: number; cap?: number }>>;
} | null | undefined): LimitRow[] {
  const src = input ?? {};
  const q = src.quotas ?? {};
  const pair = (done: number | undefined, cap: number | undefined, fallback: number) =>
    `${done ?? 0} / ${cap ?? fallback}`;
  return [
    {
      key: "x_daily_originals",
      label: "Posts",
      today: pair(src.today, src.originalCap, DESK_DEFAULTS.originals),
      value: String(src.originalCap ?? DESK_DEFAULTS.originals),
      min: 0,
      max: 12,
    },
    {
      key: "x_auto_minutes",
      label: "Minutes between posts",
      today: "20–180",
      value: String(src.minutes ?? DESK_DEFAULTS.minutes),
      min: 20,
      max: 180,
    },
    {
      key: "x_daily_likes",
      label: "Likes",
      today: pair(q.like?.done, q.like?.cap, DESK_DEFAULTS.like),
      value: String(q.like?.cap ?? DESK_DEFAULTS.like),
      min: 0,
      max: 80,
    },
    {
      key: "x_daily_follows",
      label: "Follows",
      today: pair(q.follow?.done, q.follow?.cap, DESK_DEFAULTS.follow),
      value: String(q.follow?.cap ?? DESK_DEFAULTS.follow),
      min: 0,
      max: 80,
    },
    {
      key: "x_daily_reposts",
      label: "Reposts",
      today: pair(q.repost?.done, q.repost?.cap, DESK_DEFAULTS.repost),
      value: String(q.repost?.cap ?? DESK_DEFAULTS.repost),
      min: 0,
      max: 80,
    },
    {
      key: "x_daily_comments",
      label: "Replies",
      today: pair(q.comment?.done, q.comment?.cap, DESK_DEFAULTS.comment),
      value: String(q.comment?.cap ?? DESK_DEFAULTS.comment),
      min: 0,
      max: 80,
    },
  ];
}
