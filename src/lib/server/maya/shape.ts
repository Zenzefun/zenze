import { neutralizeBareDomain } from "../../x-url.ts";

export { neutralizeBareDomain };

export const MAX_ORIGINAL = 240;
export const MAX_REPLY = 270;
export const MAX_TWEET = 280;

const COMPLETE_LINKTR = /^https:\/\/linktr\.ee\/zenzefun$/i;
const COMPLETE_X = /^https:\/\/(?:www\.)?x\.com\/\S+$/i;

/** One paragraph a person would type. Blank lines and em dashes read as a template. */
export function humanSpacing(raw: string): string {
  let t = raw
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]*[-*•]\s+/gm, "")
    .replace(/^[ \t]*\d+[.)]\s+/gm, "")
    .replace(/\s*[—–]\s*/g, ", ");

  const lines = t
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== ",");
  const parts: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    parts.push(buf.join(" "));
    buf = [];
  };
  for (const line of lines) {
    if (/^https:\/\//i.test(line)) {
      flush();
      parts.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();

  return parts
    .join("\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([,;])(?=[A-Za-z$])/g, "$1 ")
    .replace(/([.!?])(?=[A-Za-z$])/g, "$1 ")
    .replace(/\$\s+/g, "$")
    .replace(/,\s*,+/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function tidyWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

export function isCompleteUrl(u: string): boolean {
  return COMPLETE_LINKTR.test(u.trim()) || COMPLETE_X.test(u.trim());
}

export function hasCompleteZenzeUrl(text: string): boolean {
  return /https:\/\/zenze\.fun(?:\/[^\s]+)?/i.test(text) && !hasTruncatedUrl(text);
}

export function hasTruncatedUrl(text: string): boolean {
  if (/(?:^|\s)(?:ht|htt|http|https:?\/?\/?)\s*$/i.test(text)) return true;
  const tail = text.match(/https?:\/\/[^\s]*$/i);
  if (!tail) return false;
  return !isCompleteUrl(tail[0]);
}

/** Drop a trailing URL that was cut (the mill's "ht" leftover). Keep a complete zenze.fun / x.com link. */
export function stripTruncatedUrl(text: string): string {
  return text
    .replace(/\shttps?:\/\/\S*$/i, (m) => (isCompleteUrl(m.trim()) ? m : ""))
    .replace(/\shttps?:\/\/?t?p?s?:?\/?\/?\s*$/i, "")
    .replace(/\n(?:ht|htt|http|https:?\/?\/?)\s*$/i, "")
    .trim();
}

/**
 * Old mill: ETH print + 24h vol, or a price/volume print stacked on supply/bridge.
 * A short supply + bridge pin is allowed. A laundry list with a tape print is not.
 */
export function isMillDump(text: string): boolean {
  const t = text.toLowerCase();
  const ethPrint = /\beth\s+\d{3,}(?:\.\d+)?\b/.test(t) || /on the tape/.test(t);
  const volPrint = /24h vol/.test(t) || /\bvol\s+0\.0+\d*/.test(t);
  const supply = /1[,']?000[,']?000[,']?000/.test(t);
  const bridge = /bridged 1:1/.test(t);
  const pools = /pools launched/.test(t);
  if (ethPrint && volPrint) return true;
  if ((ethPrint || volPrint) && (supply || bridge || pools)) return true;
  return false;
}

/** X hides zenze.fun. Originals carry no URL. A reply may keep only the Linktree door. */
function pickUrl(text: string, kind: "original" | "reply" | "quote"): string | null {
  if (kind !== "reply") return null;
  const urls = text.match(/https:\/\/[^\s]+/gi) ?? [];
  return urls.find((u) => COMPLETE_LINKTR.test(u.trim())) ?? null;
}

function cutAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const nl2 = cut.lastIndexOf("\n\n");
  const nl = cut.lastIndexOf("\n");
  const sent = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  const at = nl2 > 48 ? nl2 : sent > 48 ? sent + 1 : nl > 48 ? nl : max;
  return cut.slice(0, at).trim();
}

export function shapePost(raw: string, kind: "original" | "reply" | "quote" = "original"): string {
  let t = neutralizeBareDomain(stripTruncatedUrl(tidyWhitespace(raw)));
  const keep = pickUrl(t, kind);
  const body = humanSpacing(
    stripTruncatedUrl(
      t
        .replace(/https:\/\/[^\s]+/gi, "")
        .trim(),
    ),
  );
  const max = kind === "original" ? MAX_ORIGINAL : MAX_REPLY;
  const budget = keep ? Math.max(80, max - keep.length - 2) : max;
  const cut = cutAtBoundary(body, budget);
  const out = keep ? `${cut}\n\n${keep}` : cut;
  return stripTruncatedUrl(out);
}

/** Last line of defense before the X API. Never slice mid-URL. */
export function tweetText(raw: string, kind: "original" | "reply" | "quote" = "original"): string {
  const shaped = shapePost(raw, kind);
  if (shaped.length <= MAX_TWEET) return shaped;
  const keep = pickUrl(shaped, kind);
  const body = shaped
    .replace(/https:\/\/[^\s]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const budget = keep ? Math.max(80, MAX_TWEET - keep.length - 2) : MAX_TWEET;
  const cut = cutAtBoundary(body, budget);
  return stripTruncatedUrl(keep ? `${cut}\n\n${keep}` : cut);
}
