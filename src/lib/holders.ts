const ZERO = "0x" + "0".repeat(40);

/** Apply one ERC-20 Transfer. Mint and burn (the zero address) are not holders. */
export function applyTransfer(balances: Map<string, bigint>, from: string, to: string, value: bigint) {
  if (value < 0n) return;
  const src = from.toLowerCase();
  const dst = to.toLowerCase();
  if (src !== ZERO) balances.set(src, (balances.get(src) ?? 0n) - value);
  if (dst !== ZERO) balances.set(dst, (balances.get(dst) ?? 0n) + value);
}

/** Addresses that still hold a balance after every transfer. */
export function positiveHolders(balances: Map<string, bigint>): number {
  let count = 0;
  for (const value of balances.values()) if (value > 0n) count += 1;
  return count;
}
