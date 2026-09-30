/** Pure parsers for live USD prints. Fetch lives in quotes.server.ts. */

export function usdFromDexPairs(pairs: unknown, wantedLower: Iterable<string>): Record<string, number> {
  const want = new Set([...wantedLower].map((s) => s.toLowerCase()));
  const best = new Map<string, { usd: number; liq: number }>();
  const list = Array.isArray(pairs) ? pairs : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as {
      priceUsd?: unknown;
      liquidity?: { usd?: unknown };
      baseToken?: { address?: unknown };
    };
    const addr = String(p.baseToken?.address ?? "").toLowerCase();
    if (!want.has(addr)) continue;
    const usd = Number(p.priceUsd);
    if (!Number.isFinite(usd) || usd <= 0) continue;
    const liq = Number(p.liquidity?.usd ?? 0);
    const prev = best.get(addr);
    if (!prev || liq >= prev.liq) best.set(addr, { usd, liq: Number.isFinite(liq) ? liq : 0 });
  }
  return Object.fromEntries([...best].map(([addr, row]) => [addr, row.usd]));
}

export function usdFromYahooChart(body: unknown): number | null {
  const n = Number(
    (body as { chart?: { result?: { meta?: { regularMarketPrice?: unknown } }[] } })?.chart?.result?.[0]?.meta
      ?.regularMarketPrice,
  );
  return Number.isFinite(n) && n > 0 ? n : null;
}
