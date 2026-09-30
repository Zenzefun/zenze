/** Keep in sync with STAKER_SHARE_BPS in fees.ts — half of recorded protocol fees. */
const STAKER_SHARE_BPS = 5000;
export const APY_MIN_TVL_USD = 100;
/** Anything above this is dust-skewed, not a rate anyone can take. */
export const APY_MAX_QUOTE = 250;

/**
 * 7-day protocol fees × staker share, annualized against staked $ZNZF value.
 * Returns 0 when fees are quiet. Returns null when TVL is too thin to quote.
 */
export function realStakeApy(
  weekNative: number,
  totalStaked: number,
  ethUsd: number | null,
  znzfPriceUsd: number | null,
): number | null {
  if (!(totalStaked > 0) || !(weekNative > 0)) return 0;
  if (ethUsd == null || ethUsd <= 0 || znzfPriceUsd == null || znzfPriceUsd <= 0) return 0;
  const weekUsd = weekNative * ethUsd;
  const stakedUsd = totalStaked * znzfPriceUsd;
  if (!(stakedUsd > 0)) return 0;
  if (stakedUsd < APY_MIN_TVL_USD) return null;
  const apy = ((weekUsd * (STAKER_SHARE_BPS / 10_000) * 52) / stakedUsd) * 100;
  if (!Number.isFinite(apy) || apy < 0) return 0;
  if (apy > APY_MAX_QUOTE) return null;
  return apy;
}

export function formatStakeApy(apy: number | null | undefined): { value: string; note: string; quoted: boolean } {
  if (apy === undefined) return { value: "—", note: "", quoted: false };
  if (apy == null) {
    return { value: "—", note: "Stake pool is too thin to quote", quoted: false };
  }
  if (!(apy > 0)) {
    return { value: "0.00%", note: "No fees in the last 7 days", quoted: true };
  }
  return { value: `${apy.toFixed(2)}%`, note: "7-day fees, annualized", quoted: true };
}
