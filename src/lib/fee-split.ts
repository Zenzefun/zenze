import { DEFAULT_CREATOR_TAX_BPS, MAX_CREATOR_TAX_BPS, TRADE_FEE_BPS } from "./chains.ts";

/** Buy-only tax at the launch timestamp. Linear to 0 across LAUNCH_SNIPE_SECONDS. */
export const LAUNCH_SNIPE_START_BPS = 9900;
export const LAUNCH_SNIPE_SECONDS = 3;

/** Percent of the 2% fee the launch form may show. 10 → 1000 on-chain bps. */
export const MAX_CREATOR_TAX_PCT = MAX_CREATOR_TAX_BPS / 100;

/** Percent of the 2% fee (0–10). On-chain creatorTaxBps is this times 100. */
export function clampCreatorTaxBps(rawPct: number): number {
  if (!Number.isFinite(rawPct) || rawPct <= 0) return 0;
  const bps = Math.round(rawPct * 100);
  if (bps > MAX_CREATOR_TAX_BPS) return MAX_CREATOR_TAX_BPS;
  return bps;
}

/**
 * What the launch field is allowed to display. Never above 10.
 * Keeps a trailing dot so "0." can still be typed.
 */
export function boundCreatorTaxDraft(raw: string): string {
  if (raw.trim().startsWith("-")) return "0";
  const cleaned = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const dot = cleaned.indexOf(".");
  const wholeRaw = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "");
  const fracRaw = dot === -1 ? "" : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const whole = wholeRaw || "0";
  const numeric = Number(`${whole}.${fracRaw || "0"}`);
  if (!Number.isFinite(numeric) || numeric > MAX_CREATOR_TAX_PCT) return String(MAX_CREATOR_TAX_PCT);
  if (Number(whole) === MAX_CREATOR_TAX_PCT && Number(fracRaw || "0") > 0) return String(MAX_CREATOR_TAX_PCT);
  if (dot === -1) return whole;
  return `${whole}.${fracRaw}`;
}

/** Normalize a draft to the percent that will actually be stored. */
export function commitCreatorTaxDraft(raw: string): string {
  const draft = boundCreatorTaxDraft(raw).replace(/\.$/, "");
  const bps = clampCreatorTaxBps(draft === "" ? 0 : Number(draft));
  const pct = bps / 100;
  if (Number.isInteger(pct)) return String(pct);
  return pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** On-chain creatorTaxBps for a new launch. Not a percent. Above the cap becomes the cap. */
export function capCreatorTaxBps(raw: number, fallback = DEFAULT_CREATOR_TAX_BPS): number {
  if (!Number.isFinite(raw)) return fallback;
  const n = Math.round(raw);
  if (n <= 0) return 0;
  if (n > MAX_CREATOR_TAX_BPS) return MAX_CREATOR_TAX_BPS;
  return n;
}

/** Basis points of the fee that go to the creator slice. Not a percent of the trade. */
export function clampShareOfFeeBps(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Math.round(Number(value));
  if (n < 0 || n > 10_000) return null;
  return n;
}

/** Creator slice as a percent of the trade. 1000 fee-bps → 0.20, not 10. */
export function creatorTradePct(taxBps: number): number {
  const bps = Math.max(0, Math.min(10_000, Math.round(taxBps)));
  return (TRADE_FEE_BPS * bps) / 1_000_000;
}

export function protocolTradePct(taxBps: number): number {
  return TRADE_FEE_BPS / 100 - creatorTradePct(taxBps);
}

export function formatFeePct(n: number): string {
  return n.toFixed(2);
}
