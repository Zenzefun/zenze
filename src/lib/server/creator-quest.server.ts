/**
 * Creator Quest checks (server only).
 *
 * The quest: launch a token and get MIN_BUYERS unique buyers. A buyer counts only if
 *   1. it is not the creator,
 *   2. it was not funded by the creator: no ERC-20 Transfer from the creator to the buyer on the
 *      token's chain (any token, topic filter, covers USDC / WETH funding), and
 *   3. the wallet is old enough: it had already sent a transaction MIN_WALLET_AGE_DAYS ago
 *      (eth_getTransactionCount at a block from that day > 0).
 *
 * Native-coin funding is not visible through plain RPC (no logs for value transfers); the age
 * rule is what stops fresh wallets the creator tops up with gas. Every check is a read: nothing
 * here signs or sends a transaction.
 */
import type { ChainKey } from "@/lib/chains";
import { chainRpc } from "@/lib/rpc.server";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const hexToNum = (hex: unknown) => (typeof hex === "string" ? Number.parseInt(hex, 16) : Number.NaN);
const toHex = (n: number) => `0x${Math.max(0, Math.floor(n)).toString(16)}`;
const topicOf = (address: string) => `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

async function headBlock(chain: ChainKey) {
  return hexToNum(await chainRpc(chain, "eth_blockNumber", []));
}

async function blockTime(chain: ChainKey, n: number) {
  const block = (await chainRpc(chain, "eth_getBlockByNumber", [toHex(n), false])) as { timestamp?: string } | null;
  return hexToNum(block?.timestamp);
}

const blockAtMemo = new Map<string, { at: number; block: number }>();

/** Last block at or before `unixSeconds` (binary search, memoized per hour bucket). */
export async function blockAtTime(chain: ChainKey, unixSeconds: number): Promise<number> {
  const key = `${chain}:${Math.floor(unixSeconds / 3600)}`;
  const hit = blockAtMemo.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.block;
  let lo = 0;
  let hi = await headBlock(chain);
  if (!Number.isFinite(hi)) throw new Error("rpc head");
  if ((await blockTime(chain, hi)) <= unixSeconds) return hi;
  for (let i = 0; i < 48 && lo < hi; i++) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const t = await blockTime(chain, mid);
    if (!Number.isFinite(t)) throw new Error("rpc block");
    if (t <= unixSeconds) lo = mid;
    else hi = mid - 1;
  }
  blockAtMemo.set(key, { at: Date.now(), block: lo });
  return lo;
}

/** True when the wallet had sent at least one transaction by `days` ago. */
export async function walletOlderThan(chain: ChainKey, wallet: string, days: number): Promise<boolean> {
  const then = Math.floor(Date.now() / 1000) - days * 86_400;
  const block = await blockAtTime(chain, then);
  const nonce = hexToNum(await chainRpc(chain, "eth_getTransactionCount", [wallet, toHex(block)]));
  return Number.isFinite(nonce) && nonce > 0;
}

/** True when any ERC-20 Transfer went from `creator` to `buyer` since `fromBlock`. */
export async function creatorFundedBuyer(chain: ChainKey, creator: string, buyer: string, fromBlock: number): Promise<boolean> {
  const logs = (await chainRpc(chain, "eth_getLogs", [
    { fromBlock: toHex(fromBlock), toBlock: "latest", topics: [TRANSFER_TOPIC, topicOf(creator), topicOf(buyer)] },
  ])) as unknown[] | null;
  return Array.isArray(logs) && logs.length > 0;
}

export type BuyerVerdict = { wallet: string; ok: boolean; reason: "ok" | "creator" | "funded" | "young" | "unverified" };

const verdictMemo = new Map<string, { at: number; verdict: BuyerVerdict }>();

/** Check one buyer. RPC failure means "unverified" (not counted), never a pass. */
export async function checkBuyer(opts: {
  chain: ChainKey;
  creator: string;
  buyer: string;
  minAgeDays: number;
  fundingFromUnix: number;
}): Promise<BuyerVerdict> {
  const creator = opts.creator.toLowerCase();
  const buyer = opts.buyer.toLowerCase();
  if (buyer === creator) return { wallet: buyer, ok: false, reason: "creator" };
  const key = `${opts.chain}:${creator}:${buyer}:${opts.minAgeDays}`;
  const hit = verdictMemo.get(key);
  // Passing verdicts are stable for a while; failing ones are re-checked sooner (a wallet ages in).
  if (hit && Date.now() - hit.at < (hit.verdict.ok ? 6 * 3600_000 : 10 * 60_000)) return hit.verdict;
  let verdict: BuyerVerdict;
  try {
    const fromBlock = await blockAtTime(opts.chain, opts.fundingFromUnix);
    if (await creatorFundedBuyer(opts.chain, creator, buyer, fromBlock)) verdict = { wallet: buyer, ok: false, reason: "funded" };
    else if (!(await walletOlderThan(opts.chain, buyer, opts.minAgeDays))) verdict = { wallet: buyer, ok: false, reason: "young" };
    else verdict = { wallet: buyer, ok: true, reason: "ok" };
  } catch {
    verdict = { wallet: buyer, ok: false, reason: "unverified" };
  }
  verdictMemo.set(key, { at: Date.now(), verdict });
  return verdict;
}
