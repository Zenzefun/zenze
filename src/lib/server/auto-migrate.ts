import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, type ChainKey } from "@/lib/chains";
import { env } from "@/lib/env.server";
import { isHexAddress } from "@/lib/intent";
import { publishedConfig, publishedZnzfCurve } from "@/lib/onchain";
import { readCurveCreator } from "@/lib/rpc.server";

const CURVE = parseAbi([
  "function migrator() view returns (address)",
  "function migrated() view returns (bool)",
  "function migrate()",
  "function setMigrator(address migrator)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";
const busy = new Set<string>();

function relayerKey() {
  const raw = env("BRIDGE_OPERATOR_KEY") || env("RELAYER_PRIVATE_KEY") || env("PRIVATE_KEY");
  if (!raw) return null;
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  return /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as `0x${string}`) : null;
}

function chainOf(key: ChainKey) {
  const c = CHAINS[key];
  return {
    id: c.id,
    name: c.name,
    nativeCurrency: { name: c.gasName, symbol: c.gas, decimals: c.decimals },
    rpcUrls: { default: { http: [c.rpc] } },
  } as const;
}

function transport(key: ChainKey) {
  return http(CHAINS[key].rpc, {
    fetchOptions: { headers: { "User-Agent": "Zenze.fun/1.0", Origin: "https://zenze.fun" } },
  });
}

/** Move a full Robinhood curve into its Uniswap v4 pool. True when that pool already exists or the move was sent. */
export async function migrateCurveIfReady(chain: ChainKey, curve: string): Promise<boolean> {
  if (chain !== "robinhood") return false;
  const address = curve.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) return false;
  if (publishedZnzfCurve(chain) === address) return false;
  if (busy.has(address)) return false;
  const key = relayerKey();
  if (!key) return false;
  busy.add(address);
  try {
    const account = privateKeyToAccount(key);
    const publicClient = createPublicClient({ chain: chainOf(chain), transport: transport(chain) });
    const curveAddr = address as `0x${string}`;
    const [migrator, migrated] = await Promise.all([
      publicClient.readContract({ address: curveAddr, abi: CURVE, functionName: "migrator" }),
      publicClient.readContract({ address: curveAddr, abi: CURVE, functionName: "migrated" }),
    ]);
    if (migrated) return true;
    const wallet = createWalletClient({ account, chain: chainOf(chain), transport: transport(chain) });
    let armed = String(migrator).toLowerCase();
    if (armed === ZERO) {
      const target = publishedConfig().znzf_v4_migrator;
      const creator = await readCurveCreator(chain, address).catch(() => null);
      if (!isHexAddress(target) || creator?.toLowerCase() !== account.address.toLowerCase()) return false;
      const arm = encodeFunctionData({ abi: CURVE, functionName: "setMigrator", args: [target as `0x${string}`] });
      await publicClient.call({ account: account.address, to: curveAddr, data: arm });
      await wallet.writeContract({ address: curveAddr, abi: CURVE, functionName: "setMigrator", args: [target as `0x${string}`] });
      armed = target.toLowerCase();
    }
    if (armed === ZERO) return false;
    const data = encodeFunctionData({ abi: CURVE, functionName: "migrate" });
    await publicClient.call({ account: account.address, to: curveAddr, data });
    await wallet.writeContract({ address: curveAddr, abi: CURVE, functionName: "migrate" });
    return true;
  } catch {
    return false;
  } finally {
    busy.delete(address);
  }
}