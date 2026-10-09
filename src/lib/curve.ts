import { TRADE_FEE_BPS, VIRTUAL_BASE, VIRTUAL_TOKENS } from "./chains";
import { asNumber } from "./format";

export type CurveState = {
  virtualBase: number;
  virtualTokens: number;
  realBase: number;
  tokensSold: number;
  feeBps?: number;
};

export function initialCurve(): CurveState {
  return {
    virtualBase: VIRTUAL_BASE,
    virtualTokens: VIRTUAL_TOKENS,
    realBase: 0,
    tokensSold: 0,
    feeBps: TRADE_FEE_BPS,
  };
}

export function poolReserves(curve: CurveState) {
  const x = curve.virtualBase + curve.realBase;
  const y = curve.virtualTokens - curve.tokensSold;
  return { x, y, k: x * y };
}

/** ETH per token on the bonding curve. */
export function spotPrice(curve: CurveState): number {
  const { x, y } = poolReserves(curve);
  if (y <= 0) return 0;
  return x / y;
}

export function curveFeeBps(curve?: CurveState | null): number {
  const n = curve?.feeBps;
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : TRADE_FEE_BPS;
}

export function applyFee(baseIn: number, feeBps: number = TRADE_FEE_BPS): { net: number; fee: number } {
  const fee = (baseIn * feeBps) / 10_000;
  return { net: baseIn - fee, fee };
}

export function quoteBuy(curve: CurveState, baseIn: number) {
  const { net, fee } = applyFee(baseIn, curveFeeBps(curve));
  const { x, y, k } = poolReserves(curve);
  const newX = x + net;
  const newY = k / newX;
  const tokensOut = Math.max(0, y - newY);
  const avgPrice = tokensOut > 0 ? net / tokensOut : 0;
  return { tokensOut, fee, net, avgPrice, newRealBase: curve.realBase + net, newSold: curve.tokensSold + tokensOut };
}

/** Snipe is taken first and stays in the pool. The 2% fee applies only to what remains. */
export function quoteBuyWithSnipe(curve: CurveState, baseIn: number, snipeBps: number) {
  const bps = Math.max(0, Math.min(10_000, snipeBps));
  const snipe = (baseIn * bps) / 10_000;
  const quoted = quoteBuy(curve, Math.max(0, baseIn - snipe));
  return { ...quoted, snipe, snipeBps: bps };
}

export function quoteSell(curve: CurveState, tokenIn: number) {
  const { x, y, k } = poolReserves(curve);
  const safeIn = Math.min(tokenIn, curve.tokensSold);
  const newY = y + safeIn;
  const newX = k / newY;
  const gross = Math.max(0, x - newX);
  const { net, fee } = applyFee(gross, curveFeeBps(curve));
  return { baseOut: net, fee, gross, newRealBase: Math.max(0, curve.realBase - gross), newSold: Math.max(0, curve.tokensSold - safeIn) };
}

export function progressToGraduation(realBase: number, target: number): number {
  return Math.min(100, (asNumber(realBase) / target) * 100);
}
