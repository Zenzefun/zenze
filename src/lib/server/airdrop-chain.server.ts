import { readFileSync } from "node:fs";
import { encodePacked, keccak256, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "@/lib/chains";
import { publishedConfig, TREASURY_WALLET } from "@/lib/onchain";
import { readTokenBalance } from "@/lib/rpc.server";

const DROP_ABI = parseAbi([
  "function claim(uint256 total, uint256 deadline, bytes signature)",
  "function claimed(address account) view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function znzf() view returns (address)",
]);

export function dropAddress() {
  const addr = publishedConfig().drop_robinhood ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
}

export function znzfAddress() {
  const addr = publishedConfig().znzf_robinhood ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
}

function signerKey(): `0x${string}` | null {
  const inline = process.env.ZNZF_SIGNER_KEY?.trim() ?? "";
  const fromEnv = inline.startsWith("0x") ? inline : inline ? `0x${inline}` : "";
  if (/^0x[a-fA-F0-9]{64}$/.test(fromEnv)) return fromEnv as `0x${string}`;
  const file = process.env.ZNZF_SIGNER_FILE || "/root/.zenze-treasury.key";
  try {
    const raw = readFileSync(file, "utf8");
    const key = raw.split(/\s+/).find((part) => /^0x[a-fA-F0-9]{64}$/.test(part));
    if (key) return key as `0x${string}`;
  } catch {
    return null;
  }
  return null;
}

export function dropSigner() {
  const key = signerKey();
  if (!key) return null;
  const account = privateKeyToAccount(key);
  if (account.address.toLowerCase() !== TREASURY_WALLET) return null;
  return account;
}

export async function signDropClaim(account: `0x${string}`, total: bigint, deadline: bigint) {
  const drop = dropAddress();
  const signer = dropSigner();
  if (!drop || !signer) return { ok: false as const, error: "The claim signer is not on this server." };
  const inner = keccak256(
    encodePacked(["uint256", "address", "address", "uint256", "uint256"], [BigInt(CHAINS.robinhood.id), drop, account, total, deadline]),
  );
  const signature = await signer.signMessage({ message: { raw: inner } });
  return { ok: true as const, drop, signature, total: total.toString(), deadline: deadline.toString() };
}

async function callView(to: `0x${string}`, data: `0x${string}`) {
  try {
    const { chainRpc } = await import("@/lib/rpc.server");
    const result = await chainRpc("robinhood", "eth_call", [{ to, data }, "latest"]);
    if (typeof result !== "string" || result === "0x") return null;
    return result as `0x${string}`;
  } catch {
    return null;
  }
}

export async function dropInventory() {
  const drop = dropAddress();
  const token = znzfAddress();
  if (!drop || !token) {
    return { deployed: false, balance: 0n, claimed: 0n, paused: false, owner: "" };
  }
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const balance = await readTokenBalance("robinhood", token, drop);
  const claimedData = await callView(drop, encodeFunctionData({ abi: DROP_ABI, functionName: "totalClaimed" }));
  const pausedData = await callView(drop, encodeFunctionData({ abi: DROP_ABI, functionName: "paused" }));
  const ownerData = await callView(drop, encodeFunctionData({ abi: DROP_ABI, functionName: "owner" }));
  const claimed = claimedData ? decodeFunctionResult({ abi: DROP_ABI, functionName: "totalClaimed", data: claimedData }) : 0n;
  const paused = pausedData ? decodeFunctionResult({ abi: DROP_ABI, functionName: "paused", data: pausedData }) : false;
  const owner = ownerData ? decodeFunctionResult({ abi: DROP_ABI, functionName: "owner", data: ownerData }) : "";
  return { deployed: true, balance, claimed, paused, owner, drop, token };
}

export async function claimedOf(account: `0x${string}`) {
  const drop = dropAddress();
  if (!drop) return 0n;
  const { encodeFunctionData, decodeFunctionResult } = await import("viem");
  const data = await callView(
    drop,
    encodeFunctionData({ abi: DROP_ABI, functionName: "claimed", args: [account] }),
  );
  if (!data) return 0n;
  return decodeFunctionResult({ abi: DROP_ABI, functionName: "claimed", data });
}

export { DROP_ABI };
