import { encodeAbiParameters, encodeFunctionData, keccak256, parseAbi } from "viem";
import { TRADE_FEE_BPS, UNISWAP_V4 } from "./chains.ts";

export type DexMarket = {
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  decimals: number;
  priceUsd: number;
  priceNative: number;
  liquidityUsd: number;
  volumeUsd: number;
  mcap: number;
  quote: string;
  /** Highest market cap observed for this pool. Absent until the first read. */
  athUsd?: number;
};

/** Uniswap v4 fee is hundredths of a bip. The high bit marks a dynamic fee. */
export function poolFeeLabel(fee: number): string {
  if (!Number.isFinite(fee) || fee < 0) return "—";
  if ((fee & 0x800000) !== 0) return "dynamic";
  const pct = fee / 10_000;
  const text = pct >= 1 ? String(Math.round(pct * 100) / 100) : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}

type PairLike = {
  chainId?: string;
  dexId?: string;
  labels?: string[];
  pairAddress?: string;
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
};

const CHAIN_SLUG: Record<string, string> = { robinhood: "robinhood" };
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000";

/** Standard ETH-quoted v4 tiers. A missing hook is the zero address. */
export const V4_ETH_TIERS: readonly (readonly [fee: number, tickSpacing: number])[] = [
  [100, 1],
  [500, 10],
  [3_000, 60],
  [10_000, 200],
  [0x800000, 10],
  [0x800000, 60],
  [0x800000, 200],
];

/** Pool id for token/ETH. ETH is address 0, so it is always currency0. */
export function ethPoolId(token: string, fee: number, tickSpacing: number, hooks = NATIVE_ETH): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [NATIVE_ETH, token.toLowerCase() as `0x${string}`, fee, tickSpacing, hooks.toLowerCase() as `0x${string}`],
    ),
  );
}

/** sqrtPriceX96 at a tick. Tick 0 is one token per one ETH when decimals match. */
export function sqrtX96AtTick(tick: number): bigint {
  if (!Number.isFinite(tick)) return 0n;
  const ratio = Math.pow(1.0001, tick / 2);
  if (!Number.isFinite(ratio) || ratio <= 0) return 0n;
  const q96 = Number(1n << 96n);
  const raw = Math.round(ratio * q96);
  if (!Number.isFinite(raw) || raw <= 0) return 0n;
  return BigInt(raw);
}

/** USD value of the liquidity that is active inside the current tick. A lower bound, not full-range TVL. */
export function activeLiquidityUsd(input: {
  sqrtPriceX96: bigint;
  tick: number;
  tickSpacing: number;
  liquidity: bigint;
  tokenDecimals: number;
  ethUsd: number;
}): number {
  if (input.liquidity <= 0n || !(input.ethUsd > 0) || input.sqrtPriceX96 <= 0n) return 0;
  const spacing = input.tickSpacing > 0 ? input.tickSpacing : 1;
  const lower = Math.trunc(input.tick / spacing) * spacing;
  const sqrtA = sqrtX96AtTick(lower);
  const sqrtB = sqrtX96AtTick(lower + spacing);
  const sqrtP = input.sqrtPriceX96;
  if (sqrtA <= 0n || sqrtB <= sqrtA || sqrtP <= sqrtA || sqrtP >= sqrtB) return 0;
  const amount0 = ((input.liquidity << 96n) * (sqrtB - sqrtP)) / sqrtB / sqrtP;
  const amount1 = (input.liquidity * (sqrtP - sqrtA)) / (1n << 96n);
  const eth = Number(amount0) / 1e18;
  const tokens = Number(amount1) / 10 ** input.tokenDecimals;
  const tokenUsd = ethPerToken(sqrtP, input.tokenDecimals) * input.ethUsd;
  if (!Number.isFinite(eth) || !Number.isFinite(tokens) || !Number.isFinite(tokenUsd)) return 0;
  const usd = eth * input.ethUsd + tokens * tokenUsd;
  return Number.isFinite(usd) && usd > 0 ? usd : 0;
}
export function ethPerToken(sqrtPriceX96: bigint, tokenDecimals: number): number {
  if (sqrtPriceX96 <= 0n || tokenDecimals < 0 || tokenDecimals > 36) return 0;
  const scale = 10n ** 18n;
  const numerator = scale * 10n ** BigInt(tokenDecimals) * (1n << 192n);
  const denominator = sqrtPriceX96 * sqrtPriceX96 * scale;
  if (denominator <= 0n) return 0;
  const whole = numerator / denominator;
  return Number(whole) / 1e18;
}
const FEE_DENOM = 10_000n;

function isEthSide(base: string | undefined, quote: string | undefined, token: string) {
  return (base === token && quote === NATIVE_ETH) || (base === NATIVE_ETH && quote === token);
}

/** Deepest Uniswap v4 pool where this token trades against native ETH. Dexscreener sometimes lists ETH as the base. */
export function pickUniswapV4Pool(chain: string, token: string, pairs: PairLike[]): PairLike | null {
  const slug = CHAIN_SLUG[chain];
  const want = token.toLowerCase();
  if (!slug || !want) return null;
  const v4 = pairs.filter((pair) => {
    const base = pair.baseToken?.address?.toLowerCase();
    const quote = pair.quoteToken?.address?.toLowerCase();
    return (
      pair.chainId === slug &&
      pair.dexId === "uniswap" &&
      pair.labels?.includes("v4") &&
      isEthSide(base, quote, want) &&
      typeof pair.pairAddress === "string" &&
      /^0x[a-fA-F0-9]{64}$/.test(pair.pairAddress)
    );
  });
  v4.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return v4[0] ?? null;
}

/** Pool deltas are from the pool's side. The trader's token change is the opposite sign. */
export function traderSwap(tokenIsCurrency0: boolean, amount0: bigint, amount1: bigint): { side: "buy" | "sell"; token: bigint; quote: bigint } | null {
  const token = tokenIsCurrency0 ? -amount0 : -amount1;
  const quote = tokenIsCurrency0 ? -amount1 : -amount0;
  if (token === 0n) return null;
  const abs = (value: bigint) => (value < 0n ? -value : value);
  return { side: token > 0n ? "buy" : "sell", token: abs(token), quote: abs(quote) };
}
export function v4EthPrice(token: string, pair: PairLike): { priceNative: number; priceUsd: number } | null {
  const want = token.toLowerCase();
  const base = pair.baseToken?.address?.toLowerCase();
  const quote = pair.quoteToken?.address?.toLowerCase();
  const rawNative = Number(pair.priceNative);
  const rawUsd = Number(pair.priceUsd);
  if (!(rawNative > 0) || !isEthSide(base, quote, want)) return null;
  if (base === want && quote === NATIVE_ETH) {
    return { priceNative: rawNative, priceUsd: rawUsd > 0 ? rawUsd : 0 };
  }
  return { priceNative: 1 / rawNative, priceUsd: rawUsd > 0 ? rawUsd / rawNative : 0 };
}

export function parseDexPool(raw: unknown): DexMarket | null {
  if (!raw || typeof raw !== "string" || !raw.startsWith("{")) return null;
  try {
    const row = JSON.parse(raw) as Partial<DexMarket>;
    if (!row.poolId || !row.currency0 || !row.currency1 || !row.hooks) return null;
    if (row.currency0.toLowerCase() !== NATIVE_ETH) return null;
    if (!(row.priceNative && row.priceNative > 0)) return null;
    return {
      poolId: row.poolId.toLowerCase(),
      currency0: row.currency0.toLowerCase(),
      currency1: row.currency1.toLowerCase(),
      fee: Number(row.fee ?? 0),
      tickSpacing: Number(row.tickSpacing ?? 0),
      hooks: row.hooks,
      decimals: Number(row.decimals ?? 18),
      priceUsd: Number(row.priceUsd ?? 0),
      priceNative: Number(row.priceNative),
      liquidityUsd: Number(row.liquidityUsd ?? 0),
      volumeUsd: Number(row.volumeUsd ?? 0),
      mcap: Number(row.mcap ?? 0),
      quote: row.quote || "ETH",
      athUsd: Number(row.athUsd) > 0 ? Number(row.athUsd) : undefined,
    };
  } catch {
    return null;
  }
}

export function tokenUnits(raw: string, decimals: number): number {
  try {
    const value = BigInt(String(raw).split(".")[0] || "0");
    const scale = 10n ** BigInt(Math.max(0, Math.floor(decimals)));
    const whole = value / scale;
    const frac = (value % scale).toString().padStart(Math.max(0, Math.floor(decimals)), "0").slice(0, 8);
    const n = Number(`${whole}.${frac}`);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** What the wallet receives after the 2% ETH fee. Buy fee comes off the input. Sell fee comes off the ETH output. */
export function netDexOut(side: "buy" | "sell", amount: number, priceNative: number, feeBps = TRADE_FEE_BPS) {
  if (!(amount > 0) || !(priceNative > 0) || feeBps <= 0 || feeBps >= 10_000) return { out: 0, fee: 0 };
  const keep = (10_000 - feeBps) / 10_000;
  if (side === "buy") {
    const swapped = amount * keep;
    return { out: swapped / priceNative, fee: amount - swapped };
  }
  const gross = amount * priceNative;
  const out = gross * keep;
  return { out, fee: gross - out };
}

const EXECUTE = parseAbi(["function execute(bytes,bytes[],uint256) payable"]);

function feeOf(amount: bigint, feeBps: number) {
  if (feeBps <= 0 || feeBps >= 10_000) return 0n;
  return (amount * BigInt(feeBps)) / FEE_DENOM;
}

export function v4SwapCall(input: {
  dex: DexMarket;
  side: "buy" | "sell";
  amountIn: bigint;
  minOut: bigint;
  deadline: bigint;
  feeRecipient: `0x${string}`;
  feeBps?: number;
}) {
  const router = UNISWAP_V4.robinhood.universalRouter;
  const feeBps = input.feeBps ?? TRADE_FEE_BPS;
  const recipient = input.feeRecipient;
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient) || recipient.toLowerCase() === NATIVE_ETH) {
    throw new Error("Swap fee recipient is not set.");
  }
  if (recipient.toLowerCase() === router.toLowerCase()) throw new Error("Swap fee recipient is not set.");
  const zeroForOne = input.side === "buy";
  const tokenIn = zeroForOne ? input.dex.currency0 : input.dex.currency1;
  const tokenOut = zeroForOne ? input.dex.currency1 : input.dex.currency0;
  const fee = input.side === "buy" ? feeOf(input.amountIn, feeBps) : 0n;
  const swapIn = input.side === "buy" ? input.amountIn - fee : input.amountIn;
  const keep = FEE_DENOM - BigInt(feeBps);
  const grossMin = input.side === "sell" ? (input.minOut * FEE_DENOM + keep - 1n) / keep : input.minOut;
  const exact = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0: input.dex.currency0 as `0x${string}`,
          currency1: input.dex.currency1 as `0x${string}`,
          fee: input.dex.fee,
          tickSpacing: input.dex.tickSpacing,
          hooks: input.dex.hooks as `0x${string}`,
        },
        zeroForOne,
        amountIn: swapIn,
        amountOutMinimum: grossMin,
        hookData: "0x",
      },
    ],
  );
  const settle = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [tokenIn as `0x${string}`, swapIn],
  );
  const take = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }],
    [tokenOut as `0x${string}`, input.minOut],
  );
  // Buy: Commands.TRANSFER (0x05) sends exactly 2% of msg.value in ETH to the vault, then V4_SWAP uses the rest.
  // Sell: TAKE_PORTION (0x10) takes 2% of the ETH credit inside the v4 swap, then TAKE_ALL sends the rest to the wallet.
  // Portion math is Uniswap BipsLibrary: (amount * bips) / 10_000. This does not sweep the router's other balances.
  const portion = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [NATIVE_ETH as `0x${string}`, recipient, BigInt(feeBps)],
  );
  const actions = input.side === "sell" ? "0x060c100f" : "0x060c0f";
  const actionParams = input.side === "sell" ? [exact, settle, portion, take] : [exact, settle, take];
  const v4Input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, actionParams]);
  const transfer = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [NATIVE_ETH as `0x${string}`, recipient, fee],
  );
  const commands = input.side === "buy" ? "0x0510" : "0x10";
  const inputs = input.side === "buy" ? [transfer, v4Input] : [v4Input];
  const data = encodeFunctionData({
    abi: EXECUTE,
    functionName: "execute",
    args: [commands, inputs, input.deadline],
  });
  return {
    to: router,
    data,
    value: input.side === "buy" ? input.amountIn : 0n,
    fee,
  };
}
