import { neutralizeBareDomain } from "../../x-url.ts";

export { neutralizeBareDomain };

export const MAX_ORIGINAL = 240;
export const MAX_REPLY = 270;
export const MAX_TWEET = 280;

const COMPLETE_X = /^https:\/\/(?:www\.)?x\.com\/\S+$/i;
const COMPLETE_SITE = /^https:\/\/zenzen\.fun(?:\/\S*)?$/i;

export const OWN_DOOR = "https://zenzen.fun";

/** One door. The old domain and Linktree are not a second system. */
export function doorUrl(_ownDomain = true) {
  return OWN_DOOR;
}

/** Rewrite a retired door onto zenzen.fun. A path on the old domain is kept. */
export function replyDoor(text: string, _ownDomain = true) {
  return text
    .replace(/https?:\/\/linktr\.ee\/zenzefun\b/gi, OWN_DOOR)
    .replace(/https?:\/\/(?:www\.)?zenze\.fun/gi, OWN_DOOR);
}

/** Keep the line breaks the model wrote. Do not split one paragraph into a slogan. */
export function humanSpacing(raw: string): string {
  const t = raw
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^[ \t]*[-*•]\s+/gm, "")
    .replace(/^[ \t]*\d+[.)]\s+/gm, "")
    .replace(/\s*[—–]\s*/g, ", ");

  const lines = t
    .split(/\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;!?])/g, "$1")
        .replace(/([,;])(?=[A-Za-z$])/g, "$1 ")
        .replace(/([.!?])(?=[A-Za-z$])/g, "$1 ")
        .replace(/\$\s+/g, "$")
        .replace(/,\s*,+/g, ",")
        .replace(/,\s*\./g, ".")
        .trim(),
    )
    .filter((line) => line && line !== ",");

  return lines.join("\n\n").trim();
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
  const t = u.trim().replace(/[),.;!?]+$/g, "");
  return COMPLETE_SITE.test(t) || COMPLETE_X.test(t);
}

export function hasCompleteZenzeUrl(text: string): boolean {
  return /https:\/\/zenzen\.fun(?:\/[^\s]+)?/i.test(text) && !hasTruncatedUrl(text);
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

/** One zenzen.fun link. A reply with no site link may keep one x.com link. */
function pickUrl(text: string, kind: "original" | "reply" | "quote"): string | null {
  const urls = text.match(/https:\/\/[^\s)]+/gi) ?? [];
  const clean = (u: string) => u.replace(/[),.;!?]+$/g, "");
  const site = urls.map(clean).filter((u) => COMPLETE_SITE.test(u));
  const withPath = site.find((u) => /^https:\/\/zenzen\.fun\/\S/i.test(u));
  if (withPath) return withPath;
  if (site[0]) return site[0];
  if (kind !== "reply") return null;
  return urls.map(clean).find((u) => COMPLETE_X.test(u)) ?? null;
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

export function pulseArmed(httpOk: boolean, body: { pulse?: { running?: boolean } } | null) {
  return httpOk && body?.pulse?.running === true;
}

export function launchNeedles(symbol: string, contractAddress: string | null | undefined) {
  const out: string[] = [];
  const sym = symbol.trim().replace(/^\$/, "");
  if (sym) out.push(`$${sym}`);
  const addr = (contractAddress || "").trim();
  if (addr) out.push(addr);
  return out;
}

export function closePulse(input: {
  originalDue: boolean;
  wrote: boolean;
  refused: string;
  executed: { skipped?: string; error?: string } | null;
}): { play: "skip"; posted: false; skipped: string; error: string; queued: number } | { kept: true } | null {
  if (input.executed && input.wrote) return { kept: true };
  if (input.originalDue && !input.wrote) {
    const why = input.refused || "Original was due and was not written.";
    const engage = input.executed?.skipped || input.executed?.error || "";
    const line = engage ? `${why} ${engage}` : why;
    return { play: "skip", posted: false, skipped: line, error: line, queued: 0 };
  }
  return null;
}

export function ensureDoor(raw: string, url: string, kind: "original" | "reply" | "quote" = "original") {
  const shaped = shapePost(raw, kind);
  if (kind !== "original") return shaped;
  if (/https:\/\/zenzen\.fun(?:\/|\b)/i.test(shaped)) return shaped;
  return `${shaped}\n\n${url}`.trim();
}

export function shapePost(raw: string, kind: "original" | "reply" | "quote" = "original"): string {
  const rewritten = neutralizeBareDomain(
    tidyWhitespace(raw).replace(/https?:\/\/linktr\.ee\/zenzefun\b/gi, OWN_DOOR),
  );
  const t = stripTruncatedUrl(rewritten);
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
