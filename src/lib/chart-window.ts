export type ChartTick = { t: string; p: number; side?: "buy" | "sell"; size?: number };

export type ChartRow = ChartTick & { ts: number };

/** Points that cover the selected range, even when no trade landed inside it. */
export function chartWindow(points: ChartTick[], rangeMs: number, now: number, currentPrice: number): ChartRow[] {
  const raw = points
    .map((point) => ({ ...point, ts: new Date(point.t).getTime() }))
    .filter((point) => Number.isFinite(point.p) && point.p > 0 && Number.isFinite(point.ts))
    .sort((a, b) => a.ts - b.ts);
  const prices = raw.map((point) => point.p).sort((a, b) => a - b);
  const mid = prices[Math.floor(prices.length / 2)] ?? 0;
  const sane = mid > 0 ? raw.filter((point) => point.p > mid / 50 && point.p < mid * 50) : raw;
  const rows = sane.length ? sane : raw;
  const start = rangeMs > 0 ? now - rangeMs : (rows[0]?.ts ?? now);
  let seed = 0;
  let anchored = false;
  for (const point of rows) {
    if (point.ts <= start) {
      seed = point.p;
      anchored = true;
    }
  }
  if (!anchored) {
    const first = rows.find((point) => point.ts > start && point.ts <= now + 5_000);
    seed = first?.p ?? (currentPrice > 0 ? currentPrice : (rows[0]?.p ?? 0));
  }
  const out: ChartRow[] = [];
  if (seed > 0) out.push({ t: new Date(start).toISOString(), p: seed, ts: start, size: 0 });
  for (const point of rows) {
    if (point.ts < start || point.ts > now + 5_000) continue;
    const prev = out[out.length - 1];
    if (prev && point.ts <= prev.ts) continue;
    out.push(point);
  }
  const live = currentPrice > 0 ? currentPrice : (out[out.length - 1]?.p ?? 0);
  if (live > 0) {
    const prev = out[out.length - 1]?.ts ?? start;
    const ts = Math.max(now, prev + 1);
    out.push({ t: new Date(ts).toISOString(), p: live, ts, size: 0 });
  }
  return out;
}

export function mergeTradeRows<T extends { tx_hash?: string | null; created_at?: string | null }>(stored: T[], live: T[]): T[] {
  const byHash = new Map<string, T>();
  const loose: T[] = [];
  for (const row of [...stored, ...live]) {
    const hash = String(row.tx_hash ?? "").toLowerCase();
    if (/^0x[a-f0-9]{64}$/.test(hash)) byHash.set(hash, row);
    else loose.push(row);
  }
  return [...byHash.values(), ...loose].sort((a, b) => +new Date(a.created_at ?? 0) - +new Date(b.created_at ?? 0));
}
