import { decodeFunctionResult, encodeFunctionData, formatUnits, parseAbi } from "viem";
import { CHAINS, TRADE_FEE_BPS, type ChainKey } from "./chains";
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

export async function chainRpc(chain: ChainKey, method: string, params: unknown[]): Promise<unknown> {
  return rpc(CHAINS[chain].rpc, method, params);
}

export async function readErc20(chain: ChainKey, address: string): Promise<RpcToken> {
  const rpcUrl = CHAINS[chain].rpc;
  const [nameData, symbolData, decimalsData, supplyData] = await Promise.all([
    ethCall(rpcUrl, address, encodeFunctionData({ abi: ERC20, functionName: "name" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: ERC20, functionName: "symbol" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: ERC20, functionName: "decimals" })),
    ethCall(rpcUrl, address, encodeFunctionData({ abi: ERC20, functionName: "totalSupply" })),
  ]);
  const name = decodeFunctionResult({ abi: ERC20, functionName: "name", data: nameData as `0x${string}` });
  const symbol = decodeFunctionResult({ abi: ERC20, functionName: "symbol", data: symbolData as `0x${string}` });
  const decimals = decodeFunctionResult({ abi: ERC20, functionName: "decimals", data: decimalsData as `0x${string}` });
  const totalSupply = decodeFunctionResult({ abi: ERC20, functionName: "totalSupply", data: supplyData as `0x${string}` });
  const ticker = cleanTokenSymbol(symbol);
  return {
    name: cleanTokenName(name, ticker),
    symbol: ticker,
    decimals: Number(decimals),
    totalSupply: totalSupply.toString(),
  };
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
  const result = await rpc(CHAINS[chain].rpc, "eth_getCode", [address, "latest"]);
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

