import { verifyMessage } from "viem";
import { isHexAddress, walletIntentMessage, type WalletAction } from "@/lib/intent";

const MAX_AGE_MS = 5 * 60 * 1000;

export async function verifyWalletIntent(input: {
  action: WalletAction;
  wallet: string;
  signature: string;
  timestamp: number;
  tokenId?: string;
  amount?: string;
}): Promise<{ ok: true; wallet: string } | { ok: false; error: string }> {
  const wallet = input.wallet.trim().toLowerCase();
  if (!isHexAddress(wallet)) return { ok: false, error: "Connect a real wallet first." };
  if (typeof input.signature !== "string" || input.signature.length < 80) {
    return { ok: false, error: "Sign the request with your wallet." };
  }
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_AGE_MS) {
    return { ok: false, error: "Signature expired. Sign again." };
  }
  const message = walletIntentMessage({
    action: input.action,
    wallet,
    tokenId: input.tokenId,
    amount: input.amount,
    timestamp: ts,
  });
  try {
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: input.signature as `0x${string}`,
    });
    if (!valid) return { ok: false, error: "Wallet signature did not match." };
    return { ok: true, wallet };
  } catch {
    return { ok: false, error: "Wallet signature did not match." };
  }
}
