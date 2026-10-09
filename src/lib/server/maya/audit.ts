/** Rival tape read on 1 Oct 2026 from live posts, 26 Sep–1 Oct. Shape only. Never their numbers. */

export const AUDIT_READ_ON = "2026-10-01";

export type RivalBeat = {
  who: string;
  at: string;
  hook: string;
  likes: number;
  views: number;
  lesson: string;
};

export const WEEKLY_RIVALS: RivalBeat[] = [
  {
    who: "@pardotfamily",
    at: "2026-09-26",
    hook: "1,170 tokens were launched today.",
    likes: 229,
    views: 12401,
    lesson: "A true count is the whole first line.",
  },
  {
    who: "@pardotfamily",
    at: "2026-09-28",
    hook: "100,000,000 $par burned.",
    likes: 153,
    views: 9703,
    lesson: "A true burn, then stop. An image sat under it.",
  },
  {
    who: "@pardotfamily",
    at: "2026-09-30",
    hook: "Launch a token on par paired with anything and send the fees straight to a fomo profile.",
    likes: 96,
    views: 6695,
    lesson: "Line 1 is the result the person gets.",
  },
  {
    who: "@ponsdotfamily",
    at: "2026-09-13",
    hook: "More Stock Token pairs are coming to Pons.",
    likes: 904,
    views: 84458,
    lesson: "A product change as line 1. The question under it is theirs, not ours.",
  },
];

export const OWN_MISS = {
  who: "@ZenzeFun",
  at: "2026-09-30",
  hook: "A pad can be quiet and still honest.",
  likes: 0,
  views: 8,
  lesson: "A mood, then a question. It did not travel.",
};

export function auditBrief(): string {
  return `Weekly rival tape, read ${AUDIT_READ_ON}. Copy the shape. Never paste a rival number.
The posts that traveled opened with one true count or one product result, then stopped.
A mood as the first line did not travel.
Line 1 is a fact someone could copy. Under 12 words. No greeting. A question, if any, comes after.`;
}

export function usesRivalFigure(text: string): boolean {
  return /1[,.]?170\b|1[,.]?510\b|100[,.]?000[,.]?000\b|125[,.]?000[,.]?000\b/.test(text);
}
