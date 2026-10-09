import { decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi } from "viem";
import { CHAINS, TRADE_FEE_BPS, type ChainKey } from "./chains";
import { decodeAbiWord } from "./erc20-text";
import { applyTransfer, positiveHolders } from "./holders";
import { cleanTokenName, cleanTokenSymbol } from "./token-name";

const ERC20 = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

const CURVE = parseAbi([
  "function realBase() view returns (uint256)",
  "function tokensSold() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function virtualBase() view returns (uint256)",
  "function virtualTokens() view returns (uint256)",
  "function FEE_BPS() view returns (uint256)",
  "function token() view returns (address)",
  "function imageURI() view returns (string)",
]);

const FACTORY = parseAbi(["function launchFee() view returns (uint256)"]);
const BRIDGE_VIEW = parseAbi(["function isOperator(address) view returns (bool)"]);

type RpcToken = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
};

async function rpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Zenze.fun/1.0 (index; +https://zenze.fun)",
      Origin: "https://zenze.fun",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "rpc error");
  return body.result;
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const result = await rpc(rpcUrl, "eth_call", [{ to, data }, "latest"]);
  if (typeof result !== "string" || result === "0x") throw new Error("empty eth_call");
  return result;
}

function rpcUrls(chain: ChainKey): readonly string[] {
  return CHAINS[chain].rpcs?.length ? CHAINS[chain].rpcs! : [CHAINS[chain].rpc];
}

function transportFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /RPC |timeout|timed out|fetch|429|502|503|504|rate|ECONN|aborted|network|empty eth_call/i.test(message);
}

async function chainCall(chain: ChainKey, method: string, params: unknown[]): Promise<unknown> {
  let last: unknown;
  for (const url of rpcUrls(chain)) {
    try {
      return await rpc(url, method, params);
    } catch (err) {
      last = err;
      if (!transportFailure(err)) throw err;
    }
  }
  throw last instanceof Error ? last : new Error("rpc error");
}

export async function chainRpc(chain: ChainKey, method: string, params: unknown[]): Promise<unknown> {
  return chainCall(chain, method, params);
}

const erc20Cache = new Map<string, { at: number; row: RpcToken }>();

async function callWord(chain: ChainKey, address: string, data: string): Promise<string> {
  let last: unknown;
  for (const url of rpcUrls(chain)) {
    try {
      return await ethCall(url, address, data);
    } catch (err) {
      last = err;
      if (!transportFailure(err)) return "";
    }
  }
  throw last instanceof Error ? last : new Error("rpc error");
}

export async function readErc20(chain: ChainKey, address: string): Promise<RpcToken> {
  const key = `${chain}:${address.toLowerCase()}`;
  const cached = erc20Cache.get(key);
  if (cached && Date.now() - cached.at < 60_000) return cached.row;
  const code = await chainCall(chain, "eth_getCode", [address, "latest"]);
  if (typeof code !== "string" || code === "0x") throw new Error("no contract");
  const symbolData = encodeFunctionData({ abi: ERC20, functionName: "symbol" });
  const nameData = encodeFunctionData({ abi: ERC20, functionName: "name" });
  const decimalsData = encodeFunctionData({ abi: ERC20, functionName: "decimals" });
  const supplyData = encodeFunctionData({ abi: ERC20, functionName: "totalSupply" });
  const [symbolRaw, nameRaw, decimalsRaw, supplyRaw] = await Promise.all([
    callWord(chain, address, symbolData),
    callWord(chain, address, nameData).catch(() => ""),
    callWord(chain, address, decimalsData).catch(() => ""),
    callWord(chain, address, supplyData).catch(() => ""),
  ]);
  const symbol = cleanTokenSymbol(decodeAbiWord(symbolRaw));
  if (!symbol) throw new Error("not a token");
  const name = cleanTokenName(decodeAbiWord(nameRaw), symbol) || symbol;
  let decimals = 18;
  if (decimalsRaw && decimalsRaw !== "0x") {
    try {
      decimals = Number(decodeFunctionResult({ abi: ERC20, functionName: "decimals", data: decimalsRaw as `0x${string}` }));
    } catch {
      decimals = 18;
    }
  }
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) decimals = 18;
  let totalSupply = "0";
  if (supplyRaw && supplyRaw !== "0x") {
    try {
      totalSupply = decodeFunctionResult({ abi: ERC20, functionName: "totalSupply", data: supplyRaw as `0x${string}` }).toString();
    } catch {
      totalSupply = "0";
    }
  }
  const row = { name, symbol, decimals, totalSupply };
  erc20Cache.set(key, { at: Date.now(), row });
  return row;
}

export async function readCurveState(
  chain: ChainKey,
  address: string,
): Promise<{
  realBase: bigint;
  tokensSold: bigint;
  graduated: boolean;
  virtualBase: bigint;
  virtualTokens: bigint;
  feeBps: number;
  token?: string;
}> {
  const rpcUrl = CHAINS[chain].rpc;
  const [real, sold, grad, virtB, virtT] = await Promise.all([
    ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "realBase" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "tokensSold" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "graduated" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "virtualBase" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "virtualTokens" })),
  ]);
  let feeBps = TRADE_FEE_BPS;
  try {
    const feeData = await ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "FEE_BPS" }));
    feeBps = Number(decodeFunctionResult({ abi: CURVE, functionName: "FEE_BPS", data: feeData as `0x${string}` }));
    if (!Number.isFinite(feeBps) || feeBps <= 0) feeBps = TRADE_FEE_BPS;
  } catch {
    feeBps = TRADE_FEE_BPS;
  }
  let token: string | undefined;
  try {
    const tokenData = await ethCall(rpcUrl, address, encodeFunctionData({ abi: CURVE, functionName: "token" }));
    token = String(decodeFunctionResult({ abi: CURVE, functionName: "token", data: tokenData as `0x${string}` })).toLowerCase();
  } catch {}
  return {
    realBase: decodeFunctionResult({ abi: CURVE, functionName: "realBase", data: real as `0x${string}` }),
    tokensSold: decodeFunctionResult({ abi: CURVE, functionName: "tokensSold", data: sold as `0x${string}` }),
    graduated: decodeFunctionResult({ abi: CURVE, functionName: "graduated", data: grad as `0x${string}` }),
    virtualBase: decodeFunctionResult({ abi: CURVE, functionName: "virtualBase", data: virtB as `0x${string}` }),
    virtualTokens: decodeFunctionResult({ abi: CURVE, functionName: "virtualTokens", data: virtT as `0x${string}` }),
    feeBps,
    token,
  };
}

/** New factory exposes launchFee(). Legacy factory reverts / empty → null. */
export async function readFactoryLaunchFee(chain: ChainKey, address: string): Promise<bigint | null> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      address,
      encodeFunctionData({ abi: FACTORY, functionName: "launchFee" }),
    );
    return decodeFunctionResult({ abi: FACTORY, functionName: "launchFee", data: data as `0x${string}` });
  } catch {
    return null;
  }
}

export async function readIsOperator(chain: ChainKey, bridge: string, wallet: string): Promise<boolean> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      bridge,
      encodeFunctionData({ abi: BRIDGE_VIEW, functionName: "isOperator", args: [wallet as `0x${string}`] }),
    );
    return Boolean(decodeFunctionResult({ abi: BRIDGE_VIEW, functionName: "isOperator", data: data as `0x${string}` }));
  } catch {
    return false;
  }
}

export async function chainHead(chain: ChainKey): Promise<{ chainId: number; block: number } | null> {
  try {
    const result = await rpc(CHAINS[chain].rpc, "eth_chainId", []);
    const chainId = Number.parseInt(String(result ?? "0x0"), 16);
    return { chainId, block: 0 };
  } catch {
    return null;
  }
}

export type ChainReceipt = {
  status: "success" | "reverted";
  from: string;
  to: string | null;
  contractAddress: string | null;
  hash: string;
  logs: { address: string; topics: string[]; data: `0x${string}` }[];
};

export type ChainTx = {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
};

export async function getReceipt(chain: ChainKey, hash: string): Promise<ChainReceipt | null> {
  const result = await rpc(CHAINS[chain].rpc, "eth_getTransactionReceipt", [hash]);
  if (!result || typeof result !== "object") return null;
  const r = result as {
    status?: string;
    from?: string;
    to?: string | null;
    contractAddress?: string | null;
    transactionHash?: string;
    logs?: { address?: string; topics?: string[]; data?: string }[];
  };
  const from = (r.from ?? "").toLowerCase();
  const to = r.to ? r.to.toLowerCase() : null;
  const contractAddress = r.contractAddress ? r.contractAddress.toLowerCase() : null;
  const raw = r.status as string | number | undefined;
  const reverted = raw === "0x0" || raw === "0" || raw === 0;
  const ok = raw === "0x1" || raw === "1" || raw === 1 || (!reverted && (r.logs?.length ?? 0) > 0);
  return {
    status: ok && !reverted ? "success" : "reverted",
    from,
    to,
    contractAddress,
    hash: (r.transactionHash ?? hash).toLowerCase(),
    logs: (r.logs ?? []).map((l) => ({
      address: (l.address ?? "").toLowerCase(),
      topics: l.topics ?? [],
      data: (l.data ?? "0x") as `0x${string}`,
    })),
  };
}

export async function getTransaction(chain: ChainKey, hash: string): Promise<ChainTx | null> {
  const result = await rpc(CHAINS[chain].rpc, "eth_getTransactionByHash", [hash]);
  if (!result || typeof result !== "object") return null;
  const r = result as { hash?: string; from?: string; to?: string | null; value?: string };
  return {
    hash: (r.hash ?? hash).toLowerCase(),
    from: (r.from ?? "").toLowerCase(),
    to: r.to ? r.to.toLowerCase() : null,
    value: BigInt(r.value ?? "0x0"),
  };
}

export async function getCode(chain: ChainKey, address: string): Promise<string> {
  const result = await chainCall(chain, "eth_getCode", [address, "latest"]);
  return typeof result === "string" ? result : "0x";
}

export async function getLogs(
  chain: ChainKey,
  address: string,
  topics: (string | null)[],
): Promise<{ address: string; topics: string[]; data: `0x${string}`; transactionHash: string }[]> {
  const result = await rpc(CHAINS[chain].rpc, "eth_getLogs", [
    { address, topics, fromBlock: "0x0", toBlock: "latest" },
  ]);
  if (!Array.isArray(result)) return [];
  return result.map((l: { address?: string; topics?: string[]; data?: string; transactionHash?: string; blockNumber?: string }) => ({
    address: (l.address ?? "").toLowerCase(),
    topics: l.topics ?? [],
    data: (l.data ?? "0x") as `0x${string}`,
    transactionHash: (l.transactionHash ?? "").toLowerCase(),
    blockNumber: l.blockNumber ?? "0x0",
  }));
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HOLDER_TTL_MS = 180_000;
const HOLDER_SCAN = 20_000;
const HOLDER_FAIL_MS = 5 * 60_000;

type HolderSnapshot = {
  at: number;
  count: number;
  scannedTo: number;
  balances: Map<string, bigint>;
  done: boolean;
};
const holderCache = new Map<string, HolderSnapshot>();
const holderFlight = new Map<string, Promise<void>>();
const holderFailedAt = new Map<string, number>();

type TransferLog = { topics?: string[]; data?: string };

function topicAddress(topic: string | undefined): string {
  if (!topic || topic.length < 42) return "0x" + "0".repeat(40);
  return `0x${topic.slice(-40)}`.toLowerCase();
}

async function rawTransferLogs(chain: ChainKey, token: string, from: number, to: number): Promise<TransferLog[]> {
  const result = await chainRpc(chain, "eth_getLogs", [
    { address: token, topics: [TRANSFER_TOPIC], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` },
  ]);
  return Array.isArray(result) ? (result as TransferLog[]) : [];
}

function logsTooWide(message: string, span: number): boolean {
  if (span <= 2_000) return false;
  return /400|bad request|exceeds limit|more than|query returned|timed out|timeout|aborted/i.test(message);
}

async function transferLogs(chain: ChainKey, token: string, from: number, to: number, attempt = 0): Promise<TransferLog[]> {
  if (to < from) return [];
  try {
    return await rawTransferLogs(chain, token, from, to);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/too many requests|429/i.test(message) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      return transferLogs(chain, token, from, to, attempt + 1);
    }
    if (logsTooWide(message, to - from) && to > from) {
      const mid = from + Math.floor((to - from) / 2);
      const left = await transferLogs(chain, token, from, mid);
      const right = await transferLogs(chain, token, mid + 1, to);
      return left.concat(right);
    }
    throw err;
  }
}

/** First block window that contains transfers. Empty history is skipped in big steps. */
async function regionStart(chain: ChainKey, token: string, from: number, to: number, stalls = 0): Promise<number | null> {
  if (to < from) return null;
  try {
    const logs = await rawTransferLogs(chain, token, from, to);
    return logs.length > 0 ? from : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/too many requests|429/i.test(message) && stalls < 4) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (stalls + 1)));
      return regionStart(chain, token, from, to, stalls + 1);
    }
    if (logsTooWide(message, to - from)) {
      if (to - from <= 10_000) return from;
      const mid = from + Math.floor((to - from) / 2);
      const left = await regionStart(chain, token, from, mid);
      if (left != null) return left;
      return regionStart(chain, token, mid + 1, to);
    }
    throw err;
  }
}

/** First block window that contains transfers. Empty history is skipped in big steps. */
async function firstHolderBlock(chain: ChainKey, token: string, head: number): Promise<number> {
  let start = 1;
  const step = 200_000;
  while (start <= head) {
    const end = Math.min(head, start + step - 1);
    const hit = await regionStart(chain, token, start, end);
    if (hit != null) return hit;
    start = end + 1;
  }
  return head;
}

function foldTransfers(balances: Map<string, bigint>, logs: TransferLog[]) {
  for (const log of logs) {
    let value = 0n;
    try {
      value = BigInt(log.data && log.data !== "0x" ? log.data : "0x0");
    } catch {
      value = 0n;
    }
    applyTransfer(balances, topicAddress(log.topics?.[1]), topicAddress(log.topics?.[2]), value);
  }
}

async function scanHolders(key: string, chain: ChainKey, token: string) {
  const headHex = await chainRpc(chain, "eth_blockNumber", []);
  const head = typeof headHex === "string" ? Number(headHex) : 0;
  if (!head) throw new Error("Chain head is unavailable.");
  const previous = holderCache.get(key);
  const balances = previous?.balances ?? new Map<string, bigint>();
  let cursor = previous?.scannedTo ?? 0;
  if (cursor === 0) cursor = Math.max(0, (await firstHolderBlock(chain, token, head)) - 1);
  const windows: Array<[number, number]> = [];
  for (let from = cursor + 1; from <= head; from += HOLDER_SCAN) {
    windows.push([from, Math.min(head, from + HOLDER_SCAN - 1)]);
  }
  for (const [from, to] of windows) {
    let logs: TransferLog[] | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6 && !logs; attempt += 1) {
      try {
        logs = await transferLogs(chain, token, from, to);
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (!/429|too many|timed out|timeout|aborted|exceeds limit/i.test(message)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    if (!logs) throw lastError instanceof Error ? lastError : new Error("Holder window failed.");
    foldTransfers(balances, logs);
    cursor = to;
    const done = cursor >= head;
    const count = positiveHolders(balances);
    holderCache.set(key, { at: Date.now(), count, scannedTo: cursor, balances, done });
    if (done) await rememberHolders(chain, token, count);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const count = positiveHolders(balances);
  holderCache.set(key, { at: Date.now(), count, scannedTo: head, balances, done: true });
  await rememberHolders(chain, token, count);
}

async function rememberHolders(chain: ChainKey, token: string, count: number) {
  try {
    const { getSql } = await import("./db");
    const sql = await getSql();
    const key = `holders:${chain}:${token.toLowerCase()}`;
    await sql`
      insert into protocol_config (key, value) values (${key}, ${String(count)})
      on conflict (key) do update set value = excluded.value
    `;
  } catch (err) {
    console.error("holder save", err instanceof Error ? err.message : err);
  }
}

/** Starts an on-chain holder scan and returns the count once that scan has finished. */
export function readTokenHolders(chain: ChainKey, token: string): { pending: boolean; holders: number | null } {
  const key = `${chain}:${token.toLowerCase()}`;
  const cached = holderCache.get(key);
  const fresh = Boolean(cached?.done && Date.now() - cached.at < HOLDER_TTL_MS);
  const failedRecently = Date.now() - (holderFailedAt.get(key) ?? 0) < HOLDER_FAIL_MS;
  if (!fresh && !failedRecently && !holderFlight.has(key)) {
    const job = scanHolders(key, chain, token.toLowerCase())
      .then(() => holderFailedAt.delete(key))
      .catch((err) => {
        holderFailedAt.set(key, Date.now());
        console.error("holder scan", key, err instanceof Error ? err.message : err);
      })
      .finally(() => holderFlight.delete(key));
    holderFlight.set(key, job);
  }
  if (cached?.done) return { pending: !fresh, holders: cached.count };
  return { pending: true, holders: null };
}

export async function readNativeBalance(chain: ChainKey, address: string): Promise<bigint> {
  const result = await rpc(CHAINS[chain].rpc, "eth_getBalance", [address, "latest"]);
  return BigInt(typeof result === "string" ? result : "0x0");
}

export async function readTokenBalance(chain: ChainKey, token: string, wallet: string): Promise<bigint> {
  const data = await ethCall(
    CHAINS[chain].rpc,
    token,
    encodeFunctionData({ abi: ERC20, functionName: "balanceOf", args: [wallet as `0x${string}`] }),
  );
  return decodeFunctionResult({ abi: ERC20, functionName: "balanceOf", data: data as `0x${string}` });
}

export function fromWei(wei: bigint | string, decimals: number): number {
  try {
    return Number(formatUnits(typeof wei === "bigint" ? wei : BigInt(wei), decimals));
  } catch {
    return 0;
  }
}

function asBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value !== "") {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

const LAUNCH_GAS_FALLBACK = 3_800_000n;
const LIST_GAS_FALLBACK = 35_000n;
const DEFAULT_GAS_FALLBACK = 280_000n;

export type TxGasQuote = {
  gas: bigint;
  gasPrice: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  value: bigint;
  balance: bigint;
  cost: bigint;
  total: bigint;
};

/** Quote L2 gas from our RPC so wallets do not use Ethereum-mainnet prices. */
export async function quoteTxGas(
  chain: ChainKey,
  tx: { from: string; to: string; data?: string; value?: bigint },
): Promise<TxGasQuote> {
  const rpcUrl = CHAINS[chain].rpc;
  const value = tx.value ?? 0n;
  const data = tx.data && tx.data !== "0x" ? tx.data : "0x";
  const call: Record<string, string> = {
    from: tx.from,
    to: tx.to,
    data,
  };
  if (value > 0n) call.value = `0x${value.toString(16)}`;

  const [gasPriceRaw, tipRaw, balanceRaw] = await Promise.all([
    rpc(rpcUrl, "eth_gasPrice", []),
    rpc(rpcUrl, "eth_maxPriorityFeePerGas", []).catch(() => "0x0"),
    rpc(rpcUrl, "eth_getBalance", [tx.from, "latest"]),
  ]);
  const gasPrice = asBigInt(gasPriceRaw) ?? 1n;
  const tip = asBigInt(tipRaw) && (asBigInt(tipRaw) as bigint) > 0n ? (asBigInt(tipRaw) as bigint) : gasPrice / 10n || 1n;
  const maxFeePerGas = gasPrice * 2n + tip;
  const balance = asBigInt(balanceRaw) ?? 0n;

  let gas = 0n;
  try {
    const estimated = asBigInt(await rpc(rpcUrl, "eth_estimateGas", [call]));
    if (estimated && estimated > 0n) gas = estimated + estimated / 4n;
  } catch {
    gas = 0n;
  }
  if (gas === 0n) {
    if (data === "0x") gas = LIST_GAS_FALLBACK;
    else if (data.length > 200) gas = LAUNCH_GAS_FALLBACK;
    else gas = DEFAULT_GAS_FALLBACK;
  }
  if (gas < 21_000n) gas = 21_000n;
  if (gas > 8_000_000n) gas = 8_000_000n;

  const cost = gas * maxFeePerGas;
  return {
    gas,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas: tip,
    value,
    balance,
    cost,
    total: value + cost,
  };
}

const CREATOR_ACCRUED = parseAbi(["function creatorAccrued() view returns (uint256)"]);
const CURVE_CREATOR = parseAbi(["function creator() view returns (address)"]);
const HOLDER_PENDING = parseAbi(["function pendingHolderFees(address account) view returns (uint256)"]);
const HOLDER_SHARING = parseAbi(["function holderSharing() view returns (bool)"]);
const CREATOR_TAX = parseAbi(["function creatorTaxBps() view returns (uint16)"]);

export async function readCurveCreator(chain: ChainKey, curve: string): Promise<string | null> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      curve,
      encodeFunctionData({ abi: CURVE_CREATOR, functionName: "creator" }),
    );
    const creator = decodeFunctionResult({ abi: CURVE_CREATOR, functionName: "creator", data: data as `0x${string}` });
    return typeof creator === "string" ? creator : null;
  } catch {
    return null;
  }
}

export async function readCreatorAccrued(chain: ChainKey, curve: string): Promise<bigint | null> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      curve,
      encodeFunctionData({ abi: CREATOR_ACCRUED, functionName: "creatorAccrued" }),
    );
    return decodeFunctionResult({ abi: CREATOR_ACCRUED, functionName: "creatorAccrued", data: data as `0x${string}` });
  } catch {
    return null;
  }
}

export async function readPendingHolderFees(chain: ChainKey, curve: string, wallet: string): Promise<bigint | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return null;
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      curve,
      encodeFunctionData({
        abi: HOLDER_PENDING,
        functionName: "pendingHolderFees",
        args: [wallet as `0x${string}`],
      }),
    );
    return decodeFunctionResult({ abi: HOLDER_PENDING, functionName: "pendingHolderFees", data: data as `0x${string}` });
  } catch {
    return null;
  }
}

export async function readHolderSharing(chain: ChainKey, curve: string): Promise<boolean | null> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      curve,
      encodeFunctionData({ abi: HOLDER_SHARING, functionName: "holderSharing" }),
    );
    return Boolean(decodeFunctionResult({ abi: HOLDER_SHARING, functionName: "holderSharing", data: data as `0x${string}` }));
  } catch {
    return null;
  }
}

export async function readCreatorTaxBps(chain: ChainKey, curve: string): Promise<number | null> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      curve,
      encodeFunctionData({ abi: CREATOR_TAX, functionName: "creatorTaxBps" }),
    );
    const n = Number(decodeFunctionResult({ abi: CREATOR_TAX, functionName: "creatorTaxBps", data: data as `0x${string}` }));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function readImageURI(chain: ChainKey, curve: string): Promise<string> {
  try {
    const data = await ethCall(
      CHAINS[chain].rpc,
      curve,
      encodeFunctionData({ abi: CURVE, functionName: "imageURI" }),
    );
    const uri = decodeFunctionResult({ abi: CURVE, functionName: "imageURI", data: data as `0x${string}` });
    return String(uri ?? "").trim();
  } catch {
    return "";
  }
}

