export type HeldRow = {
  address: string;
  symbol: string;
  amount: number;
  usd: number | null;
};

export type FeeBucket = {
  deployed: boolean;
  usd: number | null;
  native: number;
  pairCount: number;
  rows: { symbol: string; usd: number | null }[];
  empty: boolean;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export function summarizeHeld(rows: HeldRow[]): FeeBucket {
  const held = rows.filter((row) => row.amount > 0);
  const unpriced = held.some((row) => row.usd == null);
  const usd = held.length === 0 ? 0 : unpriced ? null : held.reduce((sum, row) => sum + (row.usd ?? 0), 0);
  const native = held
    .filter((row) => row.address === ZERO || row.symbol === "ETH")
    .reduce((sum, row) => sum + row.amount, 0);
  const pairCount = held.filter((row) => row.symbol !== "ETH").length;
  const top = [...held].sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1)).slice(0, 6);
  return {
    deployed: true,
    usd,
    native,
    pairCount,
    rows: top.map((row) => ({ symbol: row.symbol, usd: row.usd })),
    empty: held.length === 0,
  };
}

export function unavailableBucket(): FeeBucket {
  return { deployed: false, usd: null, native: 0, pairCount: 0, rows: [], empty: true };
}
