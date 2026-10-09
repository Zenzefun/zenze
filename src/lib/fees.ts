import { parseEther, parseUnits } from "viem";
import { CHAINS, type ChainKey } from "./chains";

/** Default protocol launch take in USD. Desk Settings can override. Wallet still pays chain gas. */
export const LAUNCH_FEE_USD = 0.5;
/** Default public listing take in USD. Operator desk can index a contract with no take. */
export const LISTING_FEE_USD = 19;
/** Legacy factory still requires this floor until a new factory (launchFee = 0) is published. */
export const FACTORY_MIN_WEI = parseEther("0.0005");
export const FEE_SLIPPAGE_BPS = 500;
export const STAKER_SHARE_BPS = 5000;

export function parseFeeUsd(raw: string | undefined | null, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) return fallback;
  return n;
}

/** Not applied on any curve. A holding rebate is not live — do not subtract this from the 2% fee. */
export function holderFeeDiscountBps(znzfHeld: number): number {
  if (!Number.isFinite(znzfHeld) || znzfHeld < 10_000) return 0;
  if (znzfHeld >= 1_000_000) return 50;
  if (znzfHeld >= 100_000) return 25;
  return 10;
}

export function usdToNativeWei(usd: number, ethUsd: number | null, chain: ChainKey): bigint {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Fee quote is unavailable.");
  if (chain === "arc") {
    return parseUnits(usd.toFixed(6), CHAINS.arc.decimals);
  }
  if (ethUsd == null || ethUsd <= 0) {
    throw new Error("ETH price is unreachable right now. Try again in a moment.");
  }
  const eth = usd / ethUsd;
  return parseUnits(eth.toFixed(8), 18);
}

export function launchValueWei(
  usd: number,
  ethUsd: number | null,
  chain: ChainKey,
  factoryMinWei: bigint = 0n,
): bigint {
  const usdWei = usdToNativeWei(usd, ethUsd, chain);
  return usdWei > factoryMinWei ? usdWei : factoryMinWei;
}

export function listValueWei(usd: number, ethUsd: number | null, chain: ChainKey): bigint {
  return usdToNativeWei(usd, ethUsd, chain);
}

export function minAcceptWei(expected: bigint): bigint {
  return (expected * BigInt(10_000 - FEE_SLIPPAGE_BPS)) / 10_000n;
}

export function weiToNative(wei: bigint, decimals: number): number {
  return Number(wei) / 10 ** decimals;
}
