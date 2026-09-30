import { quoteBuy, quoteSell, type CurveState } from "./curve";
import { isHexAddress } from "./intent";
import { quoteAddress, quoteLogoPath, quotesFor, type QuoteAsset } from "./pairs";
import { hasTradablePool, isProtocolToken } from "./pool";
import { publishedZnzfCurve } from "./onchain";
import type { ChainInfo, ChainKey } from "./chains";

/** Minimal token shape the swap catalog needs. Avoid importing server/market into the client. */
export type SwapToken = {
  id: string;
  name: string;
  symbol: string;
  image_url?: string | null;
  contract_address?: string | null;
  curve_address?: string | null;
  source?: string | null;
  graduated?: boolean | null;
  chain: ChainInfo;
  quote: QuoteAsset;
  curve: CurveState;
  feeBps?: number | null;
};

/** One selectable leg in the swap widget — a quote asset or a live curve token. */
export type SwapAsset = {
  graphId: string;
  kind: "quote" | "token";
  symbol: string;
  name: string;
  image: string;
  decimals: number;
  native: boolean;
  address: string | null;
  tokenId: string | null;
  curveAddress: string | null;
  quoteGraphId: string | null;
  quoteNative: boolean;
  quoteAddress: string | null;
  quoteDecimals: number;
  quoteSymbol: string;
  feeBps: number;
  curve: CurveState | null;
};

export type SwapHop = {
  op: "buy" | "sell";
  token: SwapAsset;
};

export type SwapRoute =
  | { ok: true; hops: SwapHop[] }
  | { ok: false; error: string };

function nativeGraphId(chain: ChainKey) {
  return `native:${chain}`;
}

function addrGraphId(address: string) {
  return `addr:${address.toLowerCase()}`;
}

export function quoteGraphId(quote: QuoteAsset, chain: ChainKey, znzfAddress?: string | null): string {
  if (quote.native) return nativeGraphId(chain);
  if (quote.key === "znzf" && isHexAddress(znzfAddress)) return addrGraphId(znzfAddress);
  const addr = quoteAddress(quote, chain);
  if (isHexAddress(addr) && addr !== "0x0000000000000000000000000000000000000000") return addrGraphId(addr);
  return `quote:${chain}:${quote.key}`;
}

export function tokenGraphId(token: { contract_address?: string | null; id: string }) {
  if (isHexAddress(token.contract_address)) return addrGraphId(token.contract_address);
  return `token:${token.id}`;
}

function quoteImage(key: string) {
  return quoteLogoPath(key);
}

export function assetFromQuote(quote: QuoteAsset, chain: ChainKey, znzfAddress?: string | null): SwapAsset | null {
  const graphId = quoteGraphId(quote, chain, znzfAddress);
  let address: string | null = null;
  if (quote.key === "znzf" && isHexAddress(znzfAddress)) address = znzfAddress.toLowerCase();
  else if (!quote.native) {
    const addr = quoteAddress(quote, chain);
    if (!isHexAddress(addr) || addr === "0x0000000000000000000000000000000000000000") return null;
    address = addr.toLowerCase();
  }
  return {
    graphId,
    kind: "quote",
    symbol: quote.symbol,
    name: quote.name,
    image: quoteImage(quote.key),
    decimals: quote.decimals,
    native: quote.native,
    address,
    tokenId: quote.key === "znzf" ? "znzf" : null,
    curveAddress: null,
    quoteGraphId: null,
    quoteNative: quote.native,
    quoteAddress: address,
    quoteDecimals: quote.decimals,
    quoteSymbol: quote.symbol,
    feeBps: 0,
    curve: null,
  };
}

export function assetFromToken(token: SwapToken, znzfAddress?: string | null): SwapAsset | null {
  const protocolCurve = isProtocolToken(token) ? publishedZnzfCurve(token.chain.key) : null;
  const curveAddr = isHexAddress(token.curve_address) ? token.curve_address : protocolCurve;
  if (!hasTradablePool({ ...token, curve_address: curveAddr }) || !isHexAddress(curveAddr)) return null;
  const quote = token.quote;
  const qid = quoteGraphId(quote, token.chain.key, znzfAddress);
  let quoteAddr: string | null = null;
  if (quote.native) quoteAddr = null;
  else if (quote.key === "znzf" && isHexAddress(znzfAddress)) quoteAddr = znzfAddress.toLowerCase();
  else {
    const addr = quoteAddress(quote, token.chain.key);
    quoteAddr = isHexAddress(addr) && addr !== "0x0000000000000000000000000000000000000000" ? addr.toLowerCase() : null;
  }
  return {
    graphId: tokenGraphId(token),
    kind: "token",
    symbol: token.symbol,
    name: token.name,
    image: token.image_url || "",
    decimals: 18,
    native: false,
    address: isHexAddress(token.contract_address) ? token.contract_address.toLowerCase() : null,
    tokenId: token.id,
    curveAddress: curveAddr.toLowerCase(),
    quoteGraphId: qid,
    quoteNative: quote.native,
    quoteAddress: quoteAddr,
    quoteDecimals: quote.decimals,
    quoteSymbol: quote.symbol,
    feeBps: token.feeBps ?? token.curve.feeBps ?? 200,
    curve: token.curve,
  };
}

export function buildSwapCatalog(input: {
  chain: ChainKey;
  tokens: SwapToken[];
  znzfAddress?: string | null;
}): SwapAsset[] {
  const out: SwapAsset[] = [];
  const seen = new Set<string>();
  function add(asset: SwapAsset | null) {
    if (!asset || seen.has(asset.graphId)) return;
    seen.add(asset.graphId);
    out.push(asset);
  }
  for (const q of quotesFor(input.chain)) add(assetFromQuote(q, input.chain, input.znzfAddress));
  for (const t of input.tokens) {
    if (t.chain.key !== input.chain) continue;
    const asset = assetFromToken(t, input.znzfAddress);
    if (!asset) continue;
    const existing = out.find((a) => a.graphId === asset.graphId);
    if (existing) {
      existing.kind = "token";
      existing.tokenId = asset.tokenId;
      existing.curveAddress = asset.curveAddress;
      existing.quoteGraphId = asset.quoteGraphId;
      existing.quoteNative = asset.quoteNative;
      existing.quoteAddress = asset.quoteAddress;
      existing.quoteDecimals = asset.quoteDecimals;
      existing.quoteSymbol = asset.quoteSymbol;
      existing.feeBps = asset.feeBps;
      existing.curve = asset.curve;
      existing.image = asset.image || existing.image;
      continue;
    }
    add(asset);
  }
  return out;
}

function neighbors(from: SwapAsset, catalog: SwapAsset[]): { hop: SwapHop; to: SwapAsset }[] {
  const edges: { hop: SwapHop; to: SwapAsset }[] = [];
  const byId = new Map(catalog.map((a) => [a.graphId, a]));
  if (from.kind === "token" && from.quoteGraphId) {
    const quote = byId.get(from.quoteGraphId);
    if (quote) edges.push({ hop: { op: "sell", token: from }, to: quote });
  }
  for (const t of catalog) {
    if (t.kind !== "token" || !t.quoteGraphId) continue;
    if (t.quoteGraphId === from.graphId && t.graphId !== from.graphId) {
      edges.push({ hop: { op: "buy", token: t }, to: t });
    }
  }
  return edges;
}

/** Assets with a curve path to `from` (the other swap leg). The graph is undirected. */
export function reachableAssets(from: SwapAsset, catalog: SwapAsset[]): SwapAsset[] {
  const byId = new Map(catalog.map((a) => [a.graphId, a]));
  const seen = new Set<string>([from.graphId]);
  const queue = [from.graphId];
  while (queue.length) {
    const id = queue.shift()!;
    const node = byId.get(id);
    if (!node) continue;
    for (const edge of neighbors(node, catalog)) {
      if (seen.has(edge.to.graphId)) continue;
      seen.add(edge.to.graphId);
      queue.push(edge.to.graphId);
    }
  }
  return catalog.filter((a) => seen.has(a.graphId));
}

/** Shortest curve route. A pool still has one quote; other tokens swap through that quote (or $ZNZF ↔ ETH). */
export function findSwapRoute(pay: SwapAsset, receive: SwapAsset, catalog: SwapAsset[]): SwapRoute {
  if (pay.graphId === receive.graphId) return { ok: false, error: "Pick two different tokens." };
  const byId = new Map(catalog.map((a) => [a.graphId, a]));
  if (!byId.has(pay.graphId) || !byId.has(receive.graphId)) {
    return { ok: false, error: "That asset is not on this chain." };
  }
  type Frame = { id: string; hops: SwapHop[] };
  const queue: Frame[] = [{ id: pay.graphId, hops: [] }];
  const seen = new Set<string>([pay.graphId]);
  const maxHops = 3;
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.hops.length >= maxHops) continue;
    const node = byId.get(cur.id);
    if (!node) continue;
    for (const edge of neighbors(node, catalog)) {
      if (seen.has(edge.to.graphId)) continue;
      const hops = [...cur.hops, edge.hop];
      if (edge.to.graphId === receive.graphId) return { ok: true, hops };
      seen.add(edge.to.graphId);
      queue.push({ id: edge.to.graphId, hops });
    }
  }
  const pair = receive.kind === "token" ? receive.quoteSymbol : pay.kind === "token" ? pay.quoteSymbol : receive.symbol;
  return {
    ok: false,
    error: `No curve route. This pool prices in ${pair}. Pay with ${pair}, or a token paired with ${pair}.`,
  };
}

export function quoteRoute(
  route: SwapRoute,
  amountIn: number,
):
  | { ok: true; amountOut: number; hops: { op: "buy" | "sell"; symbol: string; inAmt: number; outAmt: number; fee: number }[] }
  | { ok: false; error: string } {
  if (!route.ok) return route;
  if (!(amountIn > 0)) return { ok: false, error: "Enter an amount greater than zero." };
  let amt = amountIn;
  const hops: { op: "buy" | "sell"; symbol: string; inAmt: number; outAmt: number; fee: number }[] = [];
  for (const hop of route.hops) {
    const curve = hop.token.curve;
    if (!curve) return { ok: false, error: `${hop.token.symbol} has no live curve.` };
    if (hop.op === "buy") {
      const q = quoteBuy(curve, amt);
      if (q.tokensOut <= 0) return { ok: false, error: "That amount is too small for this curve." };
      hops.push({ op: "buy", symbol: hop.token.symbol, inAmt: amt, outAmt: q.tokensOut, fee: q.fee });
      amt = q.tokensOut;
    } else {
      const q = quoteSell(curve, amt);
      if (q.baseOut <= 0) return { ok: false, error: "That sell is too small for this curve." };
      hops.push({ op: "sell", symbol: hop.token.symbol, inAmt: amt, outAmt: q.baseOut, fee: q.fee });
      amt = q.baseOut;
    }
  }
  return { ok: true, amountOut: amt, hops };
}

export function routeLabel(route: SwapRoute): string {
  if (!route.ok) return "";
  return route.hops.map((h) => (h.op === "buy" ? `buy ${h.token.symbol}` : `sell ${h.token.symbol}`)).join(" → ");
}
