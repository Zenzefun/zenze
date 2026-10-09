import { decodeAbiParameters, encodeFunctionData, formatUnits, keccak256, parseAbi, toHex } from "viem";
import { CHAINS, UNISWAP_V4, type ChainKey } from "@/lib/chains";
import { NATIVE_ETH, V4_ETH_TIERS, activeLiquidityUsd, ethPerToken, ethPoolId, pickUniswapV4Pool, tokenUnits, traderSwap, v4EthPrice, type DexMarket } from "@/lib/dex-swap";
import { isHexAddress } from "@/lib/intent";
import { PAIR_ASSETS } from "@/lib/pairs";
import { fetchEthUsd } from "@/lib/quotes.server";
import { chainRpc, getTransaction, readErc20 } from "@/lib/rpc.server";

const INIT = keccak256(toHex("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)"));
const keys = new Map<string, Pick<DexMarket, "currency0" | "currency1" | "fee" | "tickSpacing" | "hooks">>();
const quotes = new Map<string, { at: number; row: DexMarket; name: string; symbol: string; supply: number }>();
const poolInflight = new Map<string, Promise<{ ok: true; dex: DexMarket; name: string; symbol: string; supply: number } | { ok: false; error: string }>>();

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function rpcBlock(tag: string | number) {
  const id = typeof tag === "number" ? `0x${tag.toString(16)}` : tag;
  return chainRpc("robinhood", "eth_getBlockByNumber", [id, false]) as Promise<{ timestamp?: string } | null>;
}

async function blockNear(createdMs: number) {
  const latestHex = await chainRpc("robinhood", "eth_blockNumber", []);
  const latest = typeof latestHex === "string" ? Number(latestHex) : 0;
  if (!latest) return null;
  const head = await rpcBlock("latest");
  const sample = await rpcBlock(Math.max(1, latest - 100_000));
  const headTs = Number(head?.timestamp ?? 0);
  const sampleTs = Number(sample?.timestamp ?? 0);
  const target = Math.floor(createdMs / 1000);
  if (!headTs || !sampleTs || headTs <= sampleTs) return null;
  const perBlock = (headTs - sampleTs) / 100_000;
  const est = Math.max(1, Math.min(latest, Math.round(latest - (headTs - target) / perBlock)));
  return { est, latest };
}

async function readInit(poolId: string, from: number, to: number) {
  const logs = await chainRpc("robinhood", "eth_getLogs", [
    {
      address: UNISWAP_V4.robinhood.poolManager,
      topics: [INIT, poolId],
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
    },
  ]);
  const log = Array.isArray(logs) ? (logs[0] as { topics?: string[]; data?: string } | undefined) : undefined;
  return log ? parseInit(log) : null;
}

async function poolKey(poolId: string, createdMs?: number) {
  const cached = keys.get(poolId);
  if (cached) return cached;
  const id = poolId.toLowerCase();
  if (createdMs && createdMs > 0) {
    try {
      const near = await blockNear(createdMs);
      if (near) {
        const from = Math.max(1, near.est - 500_000);
        const to = Math.min(near.latest, near.est + 500_000);
        const key = await readInit(id, from, to);
        if (key) {
          keys.set(id, key);
          return key;
        }
      }
    } catch {
      // Fall through to a wider walk.
    }
  }
  const latestHex = await chainRpc("robinhood", "eth_blockNumber", []);
  const latest = typeof latestHex === "string" ? Number(latestHex) : 0;
  if (!latest) return null;
  const span = 8_000_000;
  for (let end = latest; end > 0 && latest - end < span * 8; end -= span) {
    const from = Math.max(1, end - span + 1);
    try {
      const key = await readInit(id, from, end);
      if (!key) continue;
      keys.set(id, key);
      return key;
    } catch {
      continue;
    }
  }
  return null;
}

const STATE = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
]);

async function stateCall(data: `0x${string}`) {
  const raw = await chainRpc("robinhood", "eth_call", [{ to: UNISWAP_V4.robinhood.stateView, data }, "latest"]);
  return typeof raw === "string" ? raw : "";
}

async function readPoolState(poolId: `0x${string}`, decimals: number) {
  const [slotRaw, liqRaw] = await Promise.all([
    stateCall(encodeFunctionData({ abi: STATE, functionName: "getSlot0", args: [poolId] })),
    stateCall(encodeFunctionData({ abi: STATE, functionName: "getLiquidity", args: [poolId] })),
  ]);
  if (!slotRaw.startsWith("0x") || slotRaw.length < 66) return null;
  const decoded = decodeAbiParameters(
    [{ type: "uint160" }, { type: "int24" }, { type: "uint24" }, { type: "uint24" }],
    slotRaw as `0x${string}`,
  );
  const sqrt = decoded[0];
  if (sqrt <= 0n) return null;
  let liquidity = 0n;
  if (liqRaw.startsWith("0x") && liqRaw.length >= 66) {
    const [liq] = decodeAbiParameters([{ type: "uint128" }], liqRaw as `0x${string}`);
    liquidity = liq;
  }
  const priceNative = ethPerToken(sqrt, decimals);
  if (!(priceNative > 0) || !Number.isFinite(priceNative)) return null;
  return { priceNative, liquidity, sqrt, tick: Number(decoded[1]) };
}

/** Find a hookless ETH pool from the chain itself, when a market list misses it. */
export async function probeStandardEthPool(token: string, decimals = 18) {
  const hits = await Promise.all(
    V4_ETH_TIERS.map(async ([fee, tickSpacing]) => {
      const poolId = ethPoolId(token, fee, tickSpacing);
      try {
        const state = await readPoolState(poolId, decimals);
        if (!state) return null;
        return { poolId, fee, tickSpacing, hooks: NATIVE_ETH, ...state };
      } catch {
        return null;
      }
    }),
  );
  const live = hits.filter((row) => row != null);
  live.sort((a, b) => (a.liquidity > b.liquidity ? -1 : 1));
  return live[0] ?? null;
}

function parseInit(log: { topics?: string[]; data?: string }) {
  if (!log.topics?.[1] || !log.topics?.[2] || !log.topics?.[3] || !log.data) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(log.topics[1])) return null;
  try {
    const decoded = decodeAbiParameters(
      [{ type: "uint24" }, { type: "int24" }, { type: "address" }, { type: "uint160" }, { type: "int24" }],
      log.data as `0x${string}`,
    );
    return {
      poolId: log.topics[1].toLowerCase() as `0x${string}`,
      currency0: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
      currency1: `0x${log.topics[3].slice(-40)}`.toLowerCase(),
      fee: Number(decoded[0]),
      tickSpacing: Number(decoded[1]),
      hooks: String(decoded[2]).toLowerCase(),
    };
  } catch {
    return null;
  }
}

async function initLogs(token: string, from: number, to: number) {
  if (to < from) return [];
  const topic = `0x${token.slice(2).toLowerCase().padStart(64, "0")}`;
  try {
    const result = await chainRpc("robinhood", "eth_getLogs", [
      {
        address: UNISWAP_V4.robinhood.poolManager,
        topics: [INIT, null, null, topic],
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
      },
    ]);
    return Array.isArray(result) ? result.map((log) => parseInit(log as { topics?: string[]; data?: string })).filter((row) => row != null) : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/exceeds limit|timed out|timeout/i.test(message) && to - from > 2_000) {
      const mid = from + Math.floor((to - from) / 2);
      const left = await initLogs(token, from, mid);
      return left.concat(await initLogs(token, mid + 1, to));
    }
    return [];
  }
}

/** Same Initialize log the pool key reader uses, filtered to this token, for pools with a hook. */
async function findHookedEthPool(token: string, decimals: number) {
  const headHex = await chainRpc("robinhood", "eth_blockNumber", []);
  const head = typeof headHex === "string" ? Number(headHex) : 0;
  if (!head) return null;
  const want = token.toLowerCase();
  const span = 400_000;
  let hit: NonNullable<ReturnType<typeof parseInit>> | null = null;
  for (let end = head; end > 0 && head - end < span * 4; end -= span) {
    const rows = await initLogs(want, Math.max(1, end - span + 1), end);
    hit = rows.find((row) => row.currency0 === NATIVE_ETH && row.currency1 === want) ?? null;
    if (hit) break;
  }
  if (!hit) return null;
  try {
    const state = await readPoolState(hit.poolId, decimals);
    if (!state) return null;
    return { poolId: hit.poolId, fee: hit.fee, tickSpacing: hit.tickSpacing, hooks: hit.hooks, ...state };
  } catch {
    return null;
  }
}

async function publishedLiquidity(poolId: string) {
  const rows = await readDexPairs(`https://api.dexscreener.com/latest/dex/pairs/robinhood/${poolId}`);
  let best = 0;
  for (const row of rows) best = Math.max(best, num(row.liquidity?.usd));
  return best;
}

function knownSymbol(address: string) {
  const want = address.toLowerCase();
  const hit = PAIR_ASSETS.find((asset) => Object.values(asset.address).some((value) => value?.toLowerCase() === want));
  return hit?.symbol ?? "";
}

type DexPairRow = Parameters<typeof pickUniswapV4Pool>[2][number];

async function readDexPairs(url: string): Promise<DexPairRow[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0" },
      });
      if (res.status === 429 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      if (!res.ok) return [];
      const json = (await res.json()) as unknown;
      if (Array.isArray(json)) return json as DexPairRow[];
      const pairs = (json as { pairs?: unknown }).pairs;
      return Array.isArray(pairs) ? (pairs as DexPairRow[]) : [];
    } catch {
      if (attempt === 0) continue;
      return [];
    }
  }
  return [];
}

/**
 * Native-ETH v4 pairs for a token.
 * `/tokens/{address}` only returns ~30 pairs. A busy quote like USDG fills that
 * page with other tokens, so its deep ETH pool is missing until a pair search.
 */
export async function pairsForEthPool(address: string, symbol?: string): Promise<DexPairRow[]> {
  const tokenPairs = await readDexPairs(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  if (pickUniswapV4Pool("robinhood", address, tokenPairs)) return tokenPairs;
  const label = (symbol || "").trim();
  if (!label) return tokenPairs;
  const found = await readDexPairs(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(`${label} ETH`)}`);
  return tokenPairs.concat(found);
}

export async function resolveListedPool(
  chain: ChainKey,
  contract: string,
  stored?: DexMarket | null,
): Promise<{ ok: true; dex: DexMarket; name: string; symbol: string; supply: number } | { ok: false; error: string }> {
  if (chain !== "robinhood") return { ok: false, error: "Listing is only open for a Uniswap v4 pool on Robinhood Chain." };
  if (!isHexAddress(contract)) return { ok: false, error: "Paste a real contract address." };
  const address = contract.toLowerCase();
  const hit = quotes.get(address);
  if (hit && Date.now() - hit.at < 60_000) return { ok: true, dex: hit.row, name: hit.name, symbol: hit.symbol, supply: hit.supply };
  const pending = poolInflight.get(address);
  if (pending) return pending;
  const job = readListedPool(chain, address, stored).finally(() => poolInflight.delete(address));
  poolInflight.set(address, job);
  return job;
}

async function readListedPool(
  chain: ChainKey,
  address: string,
  stored?: DexMarket | null,
): Promise<{ ok: true; dex: DexMarket; name: string; symbol: string; supply: number } | { ok: false; error: string }> {
  let pairs: DexPairRow[] = [];
  try {
    const symbol = knownSymbol(address);
    pairs = await pairsForEthPool(address, symbol);
    if (!pickUniswapV4Pool(chain, address, pairs) && !symbol) {
      let ticker = "";
      try {
        ticker = (await readErc20(chain, address)).symbol;
      } catch {
        ticker = "";
      }
      if (ticker) pairs = await pairsForEthPool(address, ticker);
    }
  } catch {
    if (stored && stored.currency1 === address) {
      return { ok: true, dex: stored, name: "", symbol: "", supply: 0 };
    }
    const probed = await poolFromChain(chain, address);
    if (probed) return probed;
    return { ok: false, error: "The market could not be read. Try again in a moment." };
  }
  const best = pickUniswapV4Pool(chain, address, pairs);
  if (!best?.pairAddress) {
    const probed = await poolFromChain(chain, address);
    if (probed) return probed;
    return { ok: false, error: "That token has no Uniswap v4 ETH pool on Robinhood. List it after it trades there." };
  }
  const known = stored && stored.poolId === best.pairAddress.toLowerCase() ? stored : null;
  const key = known
    ? { currency0: known.currency0, currency1: known.currency1, fee: known.fee, tickSpacing: known.tickSpacing, hooks: known.hooks }
    : await poolKey(best.pairAddress, best.pairCreatedAt);
  if (!key) {
    const probed = await poolFromChain(chain, address);
    if (probed) return probed;
    return { ok: false, error: "The Uniswap pool was found, but its key could not be read yet." };
  }
  if (key.currency0 !== NATIVE_ETH || key.currency1 !== address) {
    return { ok: false, error: "That pool is not an ETH pair for this token." };
  }
  let name = "";
  let symbol = "";
  let decimals = known?.decimals || 18;
  let supply = 0;
  try {
    const erc = await readErc20(chain, address);
    name = erc.name;
    symbol = erc.symbol;
    decimals = erc.decimals || 18;
    supply = tokenUnits(erc.totalSupply, decimals);
  } catch {
    decimals = known?.decimals || 18;
  }
  const priced = v4EthPrice(address, best);
  if (!priced || !(priced.priceNative > 0)) return { ok: false, error: "That Uniswap pool has no price yet." };
  const mcap = num(best.marketCap) || num(best.fdv);
  const dex: DexMarket = {
    poolId: best.pairAddress.toLowerCase(),
    currency0: key.currency0,
    currency1: key.currency1,
    fee: key.fee,
    tickSpacing: key.tickSpacing,
    hooks: key.hooks,
    decimals,
    priceUsd: priced.priceUsd,
    priceNative: priced.priceNative,
    liquidityUsd: num(best.liquidity?.usd),
    volumeUsd: num(best.volume?.h24),
    mcap,
    quote: "ETH",
  };
  if (!(dex.priceUsd > 0)) return { ok: false, error: "That Uniswap pool has no price yet." };
  quotes.set(address, { at: Date.now(), row: dex, name, symbol, supply });
  return { ok: true, dex, name, symbol, supply };
}

async function poolFromChain(
  chain: ChainKey,
  address: string,
): Promise<{ ok: true; dex: DexMarket; name: string; symbol: string; supply: number } | null> {
  let name = "";
  let symbol = "";
  let decimals = 18;
  let supply = 0;
  try {
    const erc = await readErc20(chain, address);
    name = erc.name;
    symbol = erc.symbol;
    decimals = erc.decimals || 18;
    supply = tokenUnits(erc.totalSupply, decimals);
  } catch {
    decimals = 18;
  }
  const standard = await probeStandardEthPool(address, decimals);
  const probed = standard ?? (await findHookedEthPool(address, decimals));
  if (!probed) return null;
  const ethUsd = await fetchEthUsd().catch(() => 0);
  const priceUsd = probed.priceNative * (Number(ethUsd) || 0);
  if (!(priceUsd > 0)) return null;
  const listed = await publishedLiquidity(probed.poolId).catch(() => 0);
  const chainUsd = activeLiquidityUsd({
    sqrtPriceX96: probed.sqrt,
    tick: probed.tick,
    tickSpacing: probed.tickSpacing,
    liquidity: probed.liquidity,
    tokenDecimals: decimals,
    ethUsd: Number(ethUsd) || 0,
  });
  const dex: DexMarket = {
    poolId: probed.poolId,
    currency0: NATIVE_ETH,
    currency1: address,
    fee: probed.fee,
    tickSpacing: probed.tickSpacing,
    hooks: probed.hooks,
    decimals,
    priceUsd,
    priceNative: probed.priceNative,
    liquidityUsd: listed > 0 ? listed : chainUsd,
    volumeUsd: 0,
    mcap: supply > 0 ? supply * priceUsd : 0,
    quote: "ETH",
  };
  quotes.set(address, { at: Date.now(), row: dex, name, symbol, supply });
  return { ok: true, dex, name, symbol, supply };
}

const QUOTE_EXACT = parseAbi([
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)",
]);

/** Pool output for an exact input, including the pool hook. Used so the 2% platform fee is not taken from a spot guess. */
export async function quoteV4ExactIn(dex: DexMarket, zeroForOne: boolean, exactAmount: bigint): Promise<bigint | null> {
  if (exactAmount <= 0n || exactAmount > 2n ** 128n - 1n) return null;
  const data = encodeFunctionData({
    abi: QUOTE_EXACT,
    functionName: "quoteExactInputSingle",
    args: [[
      {
        currency0: dex.currency0 as `0x${string}`,
        currency1: dex.currency1 as `0x${string}`,
        fee: dex.fee,
        tickSpacing: dex.tickSpacing,
        hooks: dex.hooks as `0x${string}`,
      },
      zeroForOne,
      exactAmount,
      "0x",
    ]],
  });
  try {
    const raw = await chainRpc("robinhood", "eth_call", [{ to: UNISWAP_V4.robinhood.quoter, data }, "latest"]);
    if (typeof raw !== "string" || !raw.startsWith("0x") || raw.length < 66) return null;
    const [amountOut] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], raw as `0x${string}`);
    return amountOut > 0n ? amountOut : null;
  } catch {
    return null;
  }
}
export function dexPoolJson(dex: DexMarket) {
  return JSON.stringify(dex);
}

export type DexQuoteMarket = { address: string; priceNative: number; priceUsd: number; decimals: number };

const quoteMarkets = { at: 0, rows: [] as DexQuoteMarket[] };

const MIN_QUOTE_LIQ_USD = 1_000;

/** Spot ETH price for published quote tokens that have a Uniswap v4 ETH pool. No log scan. */
export async function loadDexQuoteMarkets(assets: { address: string; decimals: number; symbol?: string }[]): Promise<DexQuoteMarket[]> {
  if (quoteMarkets.rows.length && Date.now() - quoteMarkets.at < 60_000) return quoteMarkets.rows;
  const list = assets
    .map((asset) => ({
      address: asset.address.toLowerCase(),
      decimals: asset.decimals || 18,
      symbol: asset.symbol || knownSymbol(asset.address),
    }))
    .filter((asset) => isHexAddress(asset.address));
  const out: DexQuoteMarket[] = [];
  const queue = [...list];
  async function next() {
    const asset = queue.shift();
    if (!asset) return;
    const pairs = await pairsForEthPool(asset.address, asset.symbol);
    const best = pickUniswapV4Pool("robinhood", asset.address, pairs);
    const price = best ? v4EthPrice(asset.address, best) : null;
    const liq = Number(best?.liquidity?.usd ?? 0);
    if (price && price.priceNative > 0 && price.priceUsd > 0 && liq >= MIN_QUOTE_LIQ_USD) {
      out.push({
        address: asset.address,
        priceNative: price.priceNative,
        priceUsd: price.priceUsd,
        decimals: asset.decimals,
      });
    }
    await next();
  }
  await Promise.all(Array.from({ length: 4 }, () => next()));
  if (out.length) {
    quoteMarkets.at = Date.now();
    quoteMarkets.rows = out;
  }
  return out;
}

export const LISTING_CHAIN = CHAINS.robinhood.name;

const SWAP = keccak256(toHex("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"));
const recentSwapCache = new Map<string, { at: number; rows: RecentSwap[] }>();

export type RecentSwap = {
  id: string;
  wallet: string;
  side: "buy" | "sell";
  base_amount: number;
  token_amount: number;
  price: number;
  created_at: string;
  tx_hash: string;
};

async function swapLogs(poolId: string, from: number, to: number): Promise<{ topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string }[]> {
  if (to < from) return [];
  try {
    const result = await chainRpc("robinhood", "eth_getLogs", [
      { address: UNISWAP_V4.robinhood.poolManager, topics: [SWAP, poolId], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
    ]);
    return Array.isArray(result) ? result : [];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/exceed|limit|too many|timed out|timeout|range|pruned|response size|header not found/i.test(message) && to - from > 500) {
      const mid = from + Math.floor((to - from) / 2);
      const left = await swapLogs(poolId, from, mid);
      return left.concat(await swapLogs(poolId, mid + 1, to));
    }
    return [];
  }
}

async function toSwaps(
  dex: DexMarket,
  token: string,
  logs: { topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string }[],
  limit: number,
): Promise<RecentSwap[]> {
  const tokenIs0 = dex.currency0.toLowerCase() === token.toLowerCase();
  const picked = logs.slice(-limit);
  const blocks = new Map<string, string>();
  await Promise.all(
    [...new Set(picked.map((log) => log.blockNumber).filter((block): block is string => Boolean(block)))].map(async (block) => {
      try {
        const body = (await chainRpc("robinhood", "eth_getBlockByNumber", [block, false])) as { timestamp?: string } | null;
        if (body?.timestamp) blocks.set(block, new Date(Number(body.timestamp) * 1000).toISOString());
      } catch {
        /* the row still renders without a time */
      }
    }),
  );
  const wallets = new Map<string, string>();
  await Promise.all(
    [...new Set(picked.map((log) => (log.transactionHash ?? "").toLowerCase()).filter((hash) => hash.startsWith("0x")))].map(async (hash) => {
      try {
        const tx = await getTransaction("robinhood", hash);
        if (tx?.from) wallets.set(hash, tx.from);
      } catch {
        /* leave the wallet blank */
      }
    }),
  );
  const rows: RecentSwap[] = [];
  for (const log of picked) {
    if (!log.data) continue;
    let amount0 = 0n;
    let amount1 = 0n;
    try {
      const decoded = decodeAbiParameters(
        [{ type: "int128" }, { type: "int128" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" }, { type: "uint24" }],
        log.data as `0x${string}`,
      );
      amount0 = decoded[0];
      amount1 = decoded[1];
    } catch {
      continue;
    }
    const trade = traderSwap(tokenIs0, amount0, amount1);
    if (!trade || trade.token === 0n) continue;
    const tokenAmount = Number(formatUnits(trade.token, dex.decimals || 18));
    const quoteAmount = Number(formatUnits(trade.quote, 18));
    if (!(tokenAmount > 0)) continue;
    const hash = (log.transactionHash ?? "").toLowerCase();
    rows.push({
      id: `${hash}:${log.blockNumber ?? rows.length}`,
      wallet: wallets.get(hash) ?? "",
      side: trade.side,
      base_amount: quoteAmount,
      token_amount: tokenAmount,
      price: quoteAmount / tokenAmount,
      created_at: (log.blockNumber && blocks.get(log.blockNumber)) || new Date().toISOString(),
      tx_hash: hash,
    });
  }
  return rows;
}

/** Latest Uniswap v4 swaps for a listed pool. One recent window, cached. */
export async function readRecentSwaps(dex: DexMarket, token: string): Promise<RecentSwap[]> {
  const poolId = dex.poolId;
  if (!/^0x[a-fA-F0-9]{64}$/.test(poolId)) return [];
  const key = poolId.toLowerCase();
  const cached = recentSwapCache.get(key);
  if (cached && Date.now() - cached.at < 20_000) return cached.rows;
  const headHex = await chainRpc("robinhood", "eth_blockNumber", []);
  const head = typeof headHex === "string" ? Number(headHex) : 0;
  if (!head) return [];
  const span = 5_000;
  const rows: RecentSwap[] = [];
  let cursor = head;
  const floor = Math.max(1, head - 40_000);
  while (cursor >= floor && rows.length < 80) {
    const from = Math.max(floor, cursor - span + 1);
    const logs = await swapLogs(key, from, cursor);
    rows.unshift(...(await toSwaps(dex, token, logs, 80)));
    if (rows.length) break;
    if (from <= floor) break;
    cursor = from - 1;
  }
  const trimmed = rows.slice(-80);
  recentSwapCache.set(key, { at: Date.now(), rows: trimmed });
  return trimmed;
}

/** One older window, only used when the recent window has no swap from this wallet. */
export async function readEarlierWalletSwap(dex: DexMarket, token: string, wallet: string): Promise<RecentSwap | null> {
  const poolId = dex.poolId;
  if (!/^0x[a-fA-F0-9]{64}$/.test(poolId)) return null;
  const headHex = await chainRpc("robinhood", "eth_blockNumber", []);
  const head = typeof headHex === "string" ? Number(headHex) : 0;
  if (!head) return null;
  const recentFrom = Math.max(1, head - 150_000);
  const from = Math.max(1, recentFrom - 150_000);
  if (recentFrom - 1 < from) return null;
  const logs = await swapLogs(poolId.toLowerCase(), from, recentFrom - 1);
  const rows = await toSwaps(dex, token, logs, 12);
  return rows.find((row) => row.wallet.toLowerCase() === wallet.toLowerCase()) ?? null;
}
