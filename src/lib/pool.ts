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

/** Graduated badge: only after the curve closed into Uniswap v4. $ZNZF stays live until then. */
export function isGraduatedPool(token: {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  graduated?: boolean | null;
}): boolean {
  if (!token?.graduated) return false;
  if (isProtocolToken(token) && token.source === "protocol") return false;
  return true;
}
