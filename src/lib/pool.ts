import { isHexAddress } from "./intent";
import { publishedZnzfCurve } from "./onchain";

export function isProtocolToken(token: { id?: string | null; symbol?: string | null }): boolean {
  const id = (token.id ?? "").trim().toLowerCase();
  const symbol = (token.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  return id === "znzf" || symbol === "ZNZF";
}

/** A Zenze curve is tradable only while it is live on-chain and not yet graduated. */
export function hasTradablePool(token: {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  graduated?: boolean | null;
  curve_address?: string | null;
  chain?: { key?: string } | string | null;
}): boolean {
  if (!token) return false;
  if (token.graduated) return false;
  if (token.source === "listed" && !isProtocolToken(token)) return false;
  if (isHexAddress(token.curve_address)) return true;
  if (!isProtocolToken(token)) return false;
  const chainKey = typeof token.chain === "string" ? token.chain : token.chain?.key;
  return Boolean(publishedZnzfCurve(chainKey));
}

/** Quoted like a launchpad pool: live curve, or canonical $ZNZF on its virtual curve. */
export function hasQuotedPool(token: {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  graduated?: boolean | null;
  curve_address?: string | null;
}): boolean {
  if (!token) return false;
  if (token.graduated) return false;
  if (isProtocolToken(token)) return true;
  if (token.source === "listed") return false;
  return isHexAddress(token.curve_address);
}

/** Graduated badge: a launch curve that filled on its own. The live $ZNZF curve does not move to Uniswap. */
export function isGraduatedPool(token: {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  graduated?: boolean | null;
}): boolean {
  if (!token?.graduated) return false;
  if (token.source === "listed") return false;
  if (isProtocolToken(token)) return false;
  return true;
}

/** A listed token, or a curve that already moved, trades on Uniswap v4. */
export function hasDexPool(token: {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  graduated?: boolean | null;
  dex?: { priceNative?: number | null } | null;
}): boolean {
  if (!token || isProtocolToken(token)) return false;
  if (!(Number(token.dex?.priceNative ?? 0) > 0)) return false;
  return token.source === "listed" || Boolean(token.graduated);
}

/** Listed pool and a live curve do not share a stat row. A closed curve has neither. */
export function tokenStatMode(token: Parameters<typeof tokenSwapReady>[0]): "listed" | "curve" | "none" {
  if (hasDexPool(token)) return "listed";
  if (hasQuotedPool(token)) return "curve";
  return "none";
}
export function tokenSwapReady(token: Parameters<typeof hasQuotedPool>[0] & Parameters<typeof hasDexPool>[0]): boolean {
  return hasQuotedPool(token) || hasDexPool(token);
}
export type BoardKind = "protocol" | "curve" | "graduated" | "listed";

export function tokenBoardKind(token: {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  graduated?: boolean | null;
}): BoardKind {
  if (isProtocolToken(token)) return "protocol";
  if (token.source === "listed") return "listed";
  if (isGraduatedPool(token)) return "graduated";
  return "curve";
}
