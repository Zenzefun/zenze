import { createServerFn } from "@tanstack/react-start";
import { createPublicClient, createWalletClient, decodeEventLog, formatUnits, http, parseAbi, parseAbiItem, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, type ChainKey } from "@/lib/chains";
import { bridgeAttestCalldata, bridgeMintCalldata, PROTOCOL_ABI } from "@/lib/contracts";
import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { isHexAddress } from "@/lib/intent";
import { publishedConfig } from "@/lib/onchain";
import { fromWei, getReceipt, readTokenBalance } from "@/lib/rpc.server";
import { liveProtocolConfig } from "@/lib/server/secrets";

const LOCKED = parseAbiItem(
  "event Locked(address indexed from, uint256 amount, uint256 dstChain, bytes32 indexed id)",
);
const MINTED = parseAbiItem("event Minted(address indexed to, uint256 amount, bytes32 indexed id)");
const BRIDGE_VIEW = parseAbi([
  "function processed(bytes32) view returns (bool)",
  "function attestations(bytes32) view returns (uint256)",
  "function threshold() view returns (uint256)",
]);

function chainFromId(id: number): ChainKey | null {
  if (id === CHAINS.robinhood.id) return "robinhood";
  if (id === CHAINS.arc.id) return "arc";
  return null;
}

function viemChain(key: ChainKey) {
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
    fetchOptions: {
      headers: {
        "User-Agent": "Zenze.fun/1.0 (index; +https://zenze.fun)",
        Origin: "https://zenze.fun",
      },
    },
  });
}

function relayerKey(): Hex | null {
  const raw = env("BRIDGE_OPERATOR_KEY") || env("RELAYER_PRIVATE_KEY") || env("PRIVATE_KEY");
  if (!raw) return null;
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  return key as Hex;
}

function legacyKey(): Hex | null {
  const raw = env("LEGACY_BRIDGE_KEY");
  if (!raw) return null;
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  return key as Hex;
}

const LEGACY_ARC_TOKEN = "0xe4095f10004696e878bcdb91817b9d01318dc6e6";
const LEGACY_ARC_BRIDGE = "0xa74d6d5bef0cda86eeca57e12de288a44341616b";
const LEGACY_RH_BRIDGES = ["0x4693ba52967c656a2a5ceb0530d5b13bb51fd048"] as const;

function parseLocked(logs: { address: string; topics: string[]; data: `0x${string}` }[], bridge: string) {
  for (const log of logs) {
    if (log.address.toLowerCase() !== bridge.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: [LOCKED],
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName !== "Locked") continue;
      return {
        from: String(decoded.args.from).toLowerCase(),
        amount: decoded.args.amount as bigint,
        dstChain: Number(decoded.args.dstChain),
        id: decoded.args.id as Hex,
      };
    } catch {}
  }
  return null;
}

export const bridgeSnapshot = createServerFn({ method: "POST" })
  .validator((input) => input)
  .handler(async ({ data }: { data: any }) => {
    const cfg = await liveProtocolConfig();
    const wallet = String(data?.wallet ?? "").toLowerCase();
    const live =
      isHexAddress(cfg.znzf_robinhood) &&
      isHexAddress(cfg.znzf_arc) &&
      isHexAddress(cfg.bridge_robinhood) &&
      isHexAddress(cfg.bridge_arc);
    let robinhood = 0;
    let arc = 0;
    if (isHexAddress(wallet) && live) {
      try {
        robinhood = fromWei(await readTokenBalance("robinhood", cfg.znzf_robinhood, wallet), 18);
      } catch {}
      try {
        arc = fromWei(await readTokenBalance("arc", cfg.znzf_arc, wallet), 18);
      } catch {}
    }
    let legacy = 0;
    if (isHexAddress(wallet) && isHexAddress(LEGACY_ARC_TOKEN)) {
      try {
        legacy = fromWei(await readTokenBalance("arc", LEGACY_ARC_TOKEN, wallet), 18);
      } catch {}
    }
    const gas = await releaseGas();
    let pending: { lockTx: string; from: ChainKey; to: ChainKey; amount: number } | null = null;
    if (isHexAddress(wallet)) {
      try {
        const sql = await getSql();
        const rows = await sql<{ lock_tx: string; from_chain: string; to_chain: string; amount: string }>`
          select lock_tx, from_chain, to_chain, amount::text
          from bridge_transfers
          where sender = ${wallet} and status <> 'minted' and lock_tx is not null
          order by updated_at desc
          limit 1
        `;
        const row = rows[0];
        if (row && (row.from_chain === "robinhood" || row.from_chain === "arc") && (row.to_chain === "robinhood" || row.to_chain === "arc")) {
          pending = {
            lockTx: row.lock_tx,
            from: row.from_chain,
            to: row.to_chain,
            amount: Number(row.amount) || 0,
          };
        }
      } catch {}
    }
    return {
      live,
      automatic: Boolean(relayerKey()),
      gasRobinhood: gas.robinhood,
      gasArc: gas.arc,
      gasWallet: gas.wallet,
      znzf_robinhood: cfg.znzf_robinhood,
      znzf_arc: cfg.znzf_arc,
      bridge_robinhood: cfg.bridge_robinhood,
      bridge_arc: cfg.bridge_arc,
      legacy_arc_token: LEGACY_ARC_TOKEN,
      legacy_arc_bridge: LEGACY_ARC_BRIDGE,
      legacy,
      robinhood,
      arc,
      pending,
    };
  });

function relayerAccount() {
  const key = relayerKey();
  if (!key) return null;
  return { key, account: privateKeyToAccount(key) };
}

/** True when the release wallet can pay attest + mint. Arc gas is USDC and is priced much higher than Robinhood. */
async function releaseGas() {
  const who = relayerAccount();
  const out = { wallet: who?.account.address ?? "", robinhood: false, arc: false };
  if (!who) return out;
  await Promise.all(
    (["robinhood", "arc"] as const).map(async (chain) => {
      try {
        const pub = createPublicClient({ chain: viemChain(chain), transport: transport(chain) });
        const [bal, price] = await Promise.all([
          pub.getBalance({ address: who.account.address }),
          pub.getGasPrice(),
        ]);
        out[chain] = bal > price * 280_000n;
      } catch {
        out[chain] = false;
      }
    }),
  );
  return out;
}

function releaseError(chain: ChainKey, msg: string) {
  const gas = CHAINS[chain].gas;
  if (/exceeds the balance|insufficient funds|insufficient gas/i.test(msg)) {
    return `The lock is saved. ${CHAINS[chain].name} still needs a little ${gas} in the bridge wallet before the same amount can arrive. Add ${gas}, then press Finish.`;
  }
  if (msg === "sigs" || /signature missing/i.test(msg)) {
    return "The lock is saved. The other side has not signed it yet. Press Finish.";
  }
  return "The lock is saved. Press Finish to receive it. Nothing extra is created.";
}

async function releaseLegacy(
  locked: { from: string; amount: bigint; id: Hex },
  txHash: string,
) {
  const canonical = publishedConfig().znzf_robinhood;
  if (!isHexAddress(canonical)) return { ok: false as const, error: "Canonical $ZNZF is not published." };
  const amount = Number(formatUnits(locked.amount, 18));
  const sql = await getSql();
  await sql`
    insert into bridge_transfers (id, from_chain, to_chain, sender, amount, lock_tx, status)
    values (${locked.id}, 'arc', 'robinhood', ${locked.from}, ${amount}, ${txHash}, 'locked')
    on conflict (id) do nothing
  `;
  const dest = viemChain("robinhood");
  const pub = createPublicClient({ chain: dest, transport: transport("robinhood") });
  const opAbi = parseAbi(["function isOperator(address) view returns (bool)", "function processed(bytes32) view returns (bool)"]);
  let left = locked.amount;
  const hashes: string[] = [];
  try {
    for (const bridge of LEGACY_RH_BRIDGES) {
      if (left === 0n) break;
      const bal = await readTokenBalance("robinhood", canonical, bridge);
      const pay = bal < left ? bal : left;
      if (pay === 0n) continue;
      const done = await pub.readContract({ address: bridge as Hex, abi: opAbi, functionName: "processed", args: [locked.id] });
      if (done) continue;
      const keys = [relayerKey(), legacyKey()].filter((k): k is Hex => Boolean(k));
      let signer: Hex | null = null;
      for (const candidate of keys) {
        const account = privateKeyToAccount(candidate);
        const op = await pub.readContract({
          address: bridge as Hex,
          abi: opAbi,
          functionName: "isOperator",
          args: [account.address],
        });
        if (op) {
          signer = candidate;
          break;
        }
      }
      if (!signer) throw new Error("Legacy bridge has no signer.");
      const account = privateKeyToAccount(signer);
      const wallet = createWalletClient({ account, chain: dest, transport: transport("robinhood") });
      const attestHash = await wallet.sendTransaction({ to: bridge as Hex, data: bridgeAttestCalldata(locked.id) });
      const attestRcpt = await pub.waitForTransactionReceipt({ hash: attestHash, timeout: 120_000 });
      if (attestRcpt.status !== "success") throw new Error("Legacy attest was rejected.");
      const mintHash = await wallet.sendTransaction({
        to: bridge as Hex,
        data: bridgeMintCalldata(locked.from, pay, locked.id),
      });
      const mintRcpt = await pub.waitForTransactionReceipt({ hash: mintHash, timeout: 120_000 });
      if (mintRcpt.status !== "success") throw new Error("Legacy release was rejected.");
      hashes.push(mintHash.toLowerCase());
      left -= pay;
    }
    if (left !== 0n) throw new Error("The old bridge does not hold enough $ZNZF for this return.");
    const mintTx = hashes[0] ?? "";
    await sql`
      update bridge_transfers
         set status = 'minted', mint_tx = ${mintTx}, error = null, updated_at = now()
       where id = ${locked.id}
    `;
    return { ok: true as const, mintTx, id: locked.id, amount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "legacy";
    await sql`
      update bridge_transfers
         set status = 'failed', error = ${msg.slice(0, 160)}, updated_at = now()
       where id = ${locked.id}
    `;
    return { ok: false as const, error: "The old Arc token is burned, but the Robinhood return is not finished. Retry this return." };
  }
}

export const completeBridge = createServerFn({ method: "POST" })
  .validator((input) => input)
  .handler(async ({ data }: { data: any }) => {
    const fromChain: ChainKey = data.chain === "arc" ? "arc" : "robinhood";
    const txHash = String(data.txHash ?? "").toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(txHash)) return { ok: false as const, error: "Missing lock transaction." };
    const keys = [relayerKey(), legacyKey()].filter((k): k is Hex => Boolean(k));
    if (!keys.length) return { ok: false as const, error: "Bridge is processing. Try again in a moment." };

    const cfg = { ...publishedConfig(), ...(await liveProtocolConfig()) };
    const srcBridge = fromChain === "arc" ? cfg.bridge_arc : cfg.bridge_robinhood;
    if (!isHexAddress(srcBridge)) return { ok: false as const, error: "Bridge is not live yet." };

    const receipt = await getReceipt(fromChain, txHash);
    if (!receipt || receipt.status !== "success") return { ok: false as const, error: "Lock is not confirmed yet." };
    const legacyReturn = fromChain === "arc" ? parseLocked(receipt.logs, LEGACY_ARC_BRIDGE) : null;
    const locked = (isHexAddress(srcBridge) ? parseLocked(receipt.logs, srcBridge) : null) ?? null;
    if (legacyReturn && !locked) return releaseLegacy(legacyReturn, txHash);
    if (!locked) return { ok: false as const, error: "No lock found in that transaction." };

    const toChain = chainFromId(locked.dstChain);
    if (!toChain || toChain === fromChain) return { ok: false as const, error: "Unsupported destination." };
    const destBridge = toChain === "arc" ? cfg.bridge_arc : cfg.bridge_robinhood;
    if (!isHexAddress(destBridge)) return { ok: false as const, error: "Destination bridge is not live." };

    const amount = Number(formatUnits(locked.amount, 18));
    const sql = await getSql();
    await sql`
      insert into bridge_transfers (id, from_chain, to_chain, sender, amount, lock_tx, status)
      values (${locked.id}, ${fromChain}, ${toChain}, ${locked.from}, ${amount}, ${txHash}, 'locked')
      on conflict (id) do nothing
    `;
    const existing = await sql<{ status: string; mint_tx: string | null }>`
      select status, mint_tx from bridge_transfers where id = ${locked.id} limit 1
    `;
    if (existing[0]?.status === "minted" && existing[0].mint_tx) {
      return { ok: true as const, mintTx: existing[0].mint_tx, id: locked.id, amount };
    }

    const dest = viemChain(toChain);
    const pub = createPublicClient({ chain: dest, transport: transport(toChain) });
    const opAbi = parseAbi(["function isOperator(address) view returns (bool)"]);
    let signer: Hex | null = null;
    for (const candidate of keys) {
      const who = privateKeyToAccount(candidate);
      const op = await pub.readContract({
        address: destBridge as Hex,
        abi: opAbi,
        functionName: "isOperator",
        args: [who.address],
      });
      if (op) {
        signer = candidate;
        break;
      }
    }
    if (!signer) return { ok: false as const, error: "Bridge signer is not an operator on this side." };
    const account = privateKeyToAccount(signer);
    const wallet = createWalletClient({ account, chain: dest, transport: transport(toChain) });

    const markMinted = async (mintTx: string) => {
      await sql`
        update bridge_transfers
           set status = 'minted', mint_tx = ${mintTx.toLowerCase()}, error = null, updated_at = now()
         where id = ${locked.id}
      `;
      return { ok: true as const, mintTx: mintTx.toLowerCase(), id: locked.id, amount };
    };

    try {
      const processed = await pub.readContract({
        address: destBridge as Hex,
        abi: BRIDGE_VIEW,
        functionName: "processed",
        args: [locked.id],
      });
      if (processed) {
        let mintTx = existing[0]?.mint_tx ?? "";
        if (!mintTx) {
          const latest = await pub.getBlockNumber();
          const logs = await pub.getLogs({
            address: destBridge as Hex,
            event: MINTED,
            args: { id: locked.id },
            fromBlock: latest > 80000n ? latest - 80000n : 0n,
            toBlock: latest,
          });
          mintTx = logs.at(-1)?.transactionHash ?? "";
        }
        if (!mintTx) return { ok: true as const, mintTx: "", id: locked.id, amount };
        return markMinted(mintTx);
      }

      const threshold = await pub.readContract({
        address: destBridge as Hex,
        abi: BRIDGE_VIEW,
        functionName: "threshold",
      });
      let sigs = await pub.readContract({
        address: destBridge as Hex,
        abi: BRIDGE_VIEW,
        functionName: "attestations",
        args: [locked.id],
      });
      if (sigs < threshold) {
        const attestHash = await wallet.sendTransaction({
          to: destBridge as Hex,
          data: bridgeAttestCalldata(locked.id),
        });
        const attestRcpt = await pub.waitForTransactionReceipt({ hash: attestHash, timeout: 120_000 });
        if (attestRcpt.status !== "success") throw new Error("Attest was rejected.");
        sigs = await pub.readContract({
          address: destBridge as Hex,
          abi: BRIDGE_VIEW,
          functionName: "attestations",
          args: [locked.id],
        });
      }
      if (sigs < threshold) throw new Error("Bridge signature missing.");

      const mintHash = await wallet.sendTransaction({
        to: destBridge as Hex,
        data: bridgeMintCalldata(locked.from, locked.amount, locked.id),
      });
      const mintRcpt = await pub.waitForTransactionReceipt({ hash: mintHash, timeout: 120_000 });
      if (mintRcpt.status !== "success") throw new Error("Release was rejected.");
      return markMinted(mintHash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "complete";
      const done = await pub.readContract({
        address: destBridge as Hex,
        abi: BRIDGE_VIEW,
        functionName: "processed",
        args: [locked.id],
      }).catch(() => false);
      if (done) return markMinted(existing[0]?.mint_tx || txHash);
      await sql`
        update bridge_transfers
           set status = 'failed', error = ${msg.slice(0, 160)}, updated_at = now()
         where id = ${locked.id}
      `;
      return { ok: false as const, error: releaseError(toChain, msg) };
    }
  });
