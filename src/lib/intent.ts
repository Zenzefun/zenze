export type WalletAction = "launch" | "buy" | "sell" | "stake" | "unstake" | "list" | "deploy" | "admin" | "vote" | "propose" | "session";

export function isHexAddress(value: string | null | undefined): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

export function walletIntentMessage(input: {
  action: WalletAction;
  wallet: string;
  timestamp: number;
  tokenId?: string;
  amount?: string;
}): string {
  return [
    "Zenzen",
    `Action: ${input.action}`,
    `Wallet: ${input.wallet.toLowerCase()}`,
    input.tokenId ? `Token: ${input.tokenId}` : null,
    input.amount != null ? `Amount: ${input.amount}` : null,
    `Time: ${input.timestamp}`,
  ]
    .filter(Boolean)
    .join("\n");
}
