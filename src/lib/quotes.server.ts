import { PAIR_ASSETS } from "./pairs";
import { usdFromDexPairs, usdFromYahooChart } from "./quote-usd";

let ethCache: { at: number; usd: number } | null = null;
let mapCache: { at: number; map: Record<string, number | null> } | null = null;
let mapFlight: Promise<QuoteUsdMap> | null = null;

export type QuoteUsdMap = Record<string, number | null>;

const UA = { "User-Agent": "Mozilla/5.0 ZenzeQuote/1" };

async function getJson(url: string, ms: number, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchEthUsd(): Promise<number | null> {
  if (ethCache && Date.now() - ethCache.at < 60_000) return ethCache.usd;

  const sources: Array<() => Promise<number | null>> = [
    async () => {
      const body = (await getJson("https://api.coinbase.com/v2/exchange-rates?currency=ETH", 3500)) as {
        data?: { rates?: { USD?: string } };
      } | null;
      const n = Number(body?.data?.rates?.USD);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
    async () => {
      const body = (await getJson(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        3500,
      )) as { ethereum?: { usd?: number } } | null;
      const n = Number(body?.ethereum?.usd);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  ];

  const found = await Promise.all(
    sources.map(async (src) => {
      try {
        return await src();
      } catch {
        return null;
      }
    }),
  );
  const usd = found.find((n) => n && n > 0) ?? null;
  if (usd) ethCache = { at: Date.now(), usd };
  return usd ?? ethCache?.usd ?? null;
}

async function fetchDexUsd(addresses: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()).filter((a) => /^0x[a-f0-9]{40}$/.test(a)))];
  const out: Record<string, number> = {};
  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    const body = await getJson(`https://api.dexscreener.com/tokens/v1/robinhood/${chunk.join(",")}`, 5000);
    const pairs = Array.isArray(body) ? body : (body as { pairs?: unknown } | null)?.pairs ?? [];
    Object.assign(out, usdFromDexPairs(pairs, chunk));
  }
  return out;
}

async function fetchYahooChartUsd(symbols: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 8) {
    const chunk = unique.slice(i, i + 8);
    await Promise.all(
      chunk.map(async (sym) => {
        const body = await getJson(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          4000,
          UA,
        );
        const n = usdFromYahooChart(body);
        if (n) out[sym] = n;
      }),
    );
  }
  return out;
}

function pairAddresses(asset: (typeof PAIR_ASSETS)[number]): string[] {
  return Object.values(asset.address).filter((a): a is string => Boolean(a) && /^0x[a-fA-F0-9]{40}$/.test(a));
}

/** Live USD for every analytics pair: on-chain Dexscreener, ETH CEX, stables $1, Yahoo/refUsd fallback. */
export async function fetchQuoteUsdMap(): Promise<QuoteUsdMap> {
  if (mapCache && Date.now() - mapCache.at < 15_000) return { ...mapCache.map };
  if (mapFlight) return mapFlight;
  mapFlight = loadQuoteUsdMap().finally(() => {
    mapFlight = null;
  });
  return mapFlight;
}

async function loadQuoteUsdMap(): Promise<QuoteUsdMap> {
  if (mapCache && Date.now() - mapCache.at < 15_000) return { ...mapCache.map };

  const priced = PAIR_ASSETS.filter(
    (a) => a.key !== "eth" && a.kind !== "stable" && a.key !== "usdc" && a.key !== "usdg",
  );
  const addrs = priced.flatMap(pairAddresses);
  const [eth, dex] = await Promise.all([fetchEthUsd(), fetchDexUsd(addrs)]);
  const missingStocks = PAIR_ASSETS.filter((a) => {
    if (a.kind !== "stock") return false;
    return !pairAddresses(a).some((addr) => dex[addr.toLowerCase()] > 0);
  }).map((a) => a.symbol);
  const yahoo = missingStocks.length ? await fetchYahooChartUsd(missingStocks) : {};

  const map: QuoteUsdMap = { eth };
  for (const asset of PAIR_ASSETS) {
    if (asset.key === "eth") {
      map.eth = eth;
      continue;
    }
    if (asset.kind === "stable" || asset.key === "usdc" || asset.key === "usdg") {
      map[asset.key] = 1;
      continue;
    }
    const dexHit = pairAddresses(asset)
      .map((a) => dex[a.toLowerCase()])
      .find((n) => n && n > 0);
    if (dexHit) {
      map[asset.key] = dexHit;
      continue;
    }
    if (asset.kind === "stock") {
      const livePx = yahoo[asset.symbol.toUpperCase()];
      map[asset.key] = livePx && livePx > 0 ? livePx : (asset.refUsd ?? null);
      continue;
    }
    map[asset.key] = asset.refUsd && asset.refUsd > 0 ? asset.refUsd : null;
  }

  mapCache = { at: Date.now(), map };
  return { ...map };
}
