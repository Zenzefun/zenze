import { formatUsdCompact } from "./format.ts";

/** Their X handle, never ours, never a URL. A post that starts with @ is shown to almost nobody. */
export function projectHandle(raw: string | null | undefined): string {
  const handle = String(raw ?? "")
    .replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return "";
  if (/^zenzefun$/i.test(handle)) return "";
  return handle;
}

export function telegramHandle(raw: string | null | undefined): string {
  const handle = String(raw ?? "")
    .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) return "";
  return handle;
}

/** One real figure, or nothing. A tiny pool is not a boast. */
export function listingProof(liquidityUsd?: number | null, mcap?: number | null): string {
  const liq = Number(liquidityUsd);
  const cap = Number(mcap);
  if (liq >= 1_000) return `The pool already holds ${formatUsdCompact(liq)} of liquidity.`;
  if (cap >= 1_000) return `Market cap is ${formatUsdCompact(cap)}.`;
  return "";
}

/** Named without a t.me link. Outbound links in the main post get buried for non-followers. */
export function listingRoom(telegram: string | null | undefined): string {
  const handle = telegramHandle(telegram);
  if (!handle) return "";
  return `They talk on Telegram as @${handle}.`;
}
