import { CHAINS, type ChainKey } from "./chains";

export type QuoteKey = string;
export type PairKind = "native" | "stable" | "protocol" | "stock";

export type QuoteAsset = {
  key: QuoteKey;
  symbol: string;
  name: string;
  pair: string;
  decimals: number;
  graduation: number;
  virtualBase: number;
  virtualTokens: number;
  chains: ChainKey[];
  address: Partial<Record<ChainKey, string>>;
  native: boolean;
  kind: PairKind;
  note: string;
  /** Static fallback USD when a live print is unavailable (private names, brief outages). */
  refUsd?: number;
};

const MEME_VIRTUAL_TOKENS = 1_073_000_000;

function core(partial: Omit<QuoteAsset, "virtualTokens" | "pair"> & { pair?: string }): QuoteAsset {
  return {
    virtualTokens: MEME_VIRTUAL_TOKENS,
    pair: partial.pair ?? partial.symbol,
    ...partial,
  };
}

/** Graduation in quote-token units ≈ $10k of the asset (curve parameter, not a live price). */
function stock(
  symbol: string,
  name: string,
  address: string,
  approxUsd: number,
): QuoteAsset {
  const graduation = Math.max(8, Math.round(10_000 / Math.max(approxUsd, 1)));
  return core({
    key: symbol.toLowerCase(),
    symbol,
    name,
    pair: symbol,
    decimals: 18,
    graduation,
    virtualBase: Math.round(graduation * 1.25),
    chains: ["robinhood"],
    address: { robinhood: address },
    native: false,
    kind: "stock",
    refUsd: approxUsd,
    note: `${name} • Robinhood Token. Canonical contract on Robinhood Chain.`,
  });
}

/**
 * Canonical Robinhood Chain pair assets.
 * Stock/ETF addresses are the issuer contracts (name suffix "• Robinhood Token"),
 * cross-checked against Circlo / HoodL2 / Robinhood docs. Copies with the same ticker are ignored.
 */
export const PAIR_ASSETS: QuoteAsset[] = [
  core({
    key: "eth",
    symbol: "ETH",
    name: "Ether",
    pair: "ETH",
    decimals: 18,
    graduation: 2,
    virtualBase: 30,
    chains: ["robinhood"],
    address: { robinhood: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" },
    native: true,
    kind: "native",
    note: "Robinhood Chain gas. Optional wrapped form is aeWETH.",
  }),
  core({
    key: "usdg",
    symbol: "USDG",
    name: "Global Dollar",
    pair: "USDG",
    decimals: 6,
    graduation: 10_000,
    virtualBase: 12_500,
    chains: ["robinhood"],
    address: { robinhood: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" },
    native: false,
    kind: "stable",
    note: "Paxos Global Dollar — native stablecoin on Robinhood Chain.",
  }),
  core({
    key: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    pair: "USDC",
    decimals: 18,
    graduation: 10_000,
    virtualBase: 12_500,
    chains: ["arc"],
    address: { arc: "0x3600000000000000000000000000000000000000" },
    native: true,
    kind: "native",
    note: "Arc native gas. Dollar pair on Circle’s L1.",
  }),
  core({
    key: "znzf",
    symbol: "ZNZF",
    name: "Zenze",
    pair: "$ZNZF",
    decimals: 18,
    graduation: 1_000_000,
    virtualBase: 1_250_000,
    chains: ["robinhood", "arc"],
    address: {},
    native: false,
    kind: "protocol",
    note: "Protocol token. Canonical on Robinhood Chain, bridged on Arc.",
  }),
  core({
    key: "pons",
    symbol: "PONS",
    name: "Pons",
    pair: "PONS",
    decimals: 18,
    graduation: 20_000,
    virtualBase: 25_000,
    chains: ["robinhood"],
    address: { robinhood: "0x39dBED3a2bd333467115dE45665cC57F813C4571" },
    native: false,
    kind: "protocol",
    note: "PONS ERC-20 on Robinhood Chain.",
  }),
  stock("NVDA", "NVIDIA", "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", 222),
  stock("SPY", "SPDR S&P 500 ETF", "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", 764),
  stock("TSLA", "Tesla", "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", 364),
  stock("AAPL", "Apple", "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", 230),
  stock("AMZN", "Amazon", "0x12f190a9F9d7D37a250758b26824B97CE941bF54", 254),
  stock("MSFT", "Microsoft", "0xe93237C50D904957Cf27E7B1133b510C669c2e74", 430),
  stock("GOOGL", "Alphabet", "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", 180),
  stock("META", "Meta Platforms", "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", 580),
  stock("QQQ", "Invesco QQQ", "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", 480),
  stock("SGOV", "iShares 0-3M Treasury", "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5", 101),
  stock("SPCX", "SpaceX", "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", 153),
  stock("GME", "GameStop", "0x1b0e319c6a659f002271b69db8a7df2f911c153e", 24),
  stock("HIMS", "Hims & Hers Health", "0xccee82fe024c36fa15e1005ede3e9e4787e23d09", 28),
  stock("GLD", "SPDR Gold Shares", "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e", 721),
  stock("SLV", "iShares Silver Trust", "0x411efb0e7f985935daec3d4c3ebaea0d0ad7d89f", 32),
  stock("COIN", "Coinbase", "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", 220),
  stock("PLTR", "Palantir", "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", 160),
  stock("MSTR", "Strategy", "0xec262a75e413fafd0df80480274532c79d42da09", 154),
  stock("AMD", "AMD", "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", 160),
  stock("NFLX", "Netflix", "0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8", 700),
  stock("AVGO", "Broadcom", "0x156e175dd063a8ce274c50654ef40e0032b3fbcf", 340),
  stock("INTC", "Intel", "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681", 30),
  stock("IBM", "IBM", "0x980dcf6766fa79f5cf0c4aadb3ab477ff15a9619", 250),
  stock("COST", "Costco", "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", 940),
  stock("SHOP", "Shopify", "0xf53f66751b1eff985311b693531e3290f600c410", 140),
  stock("FIG", "Figma", "0x41f4267525a8aff329540ef24fd83d9044758b33", 50),
  stock("DJT", "Trump Media", "0x1D11f0496982706C5e14A514D4E79F2e6BdE4516", 16),
  stock("BULL", "Webull", "0x5fa35021adcf83d56b71452eeab796a5c1fb3cd6", 12),
];

const BY_KEY = new Map(PAIR_ASSETS.map((p) => [p.key, p]));

export const QUOTES: Record<string, QuoteAsset> = Object.fromEntries(PAIR_ASSETS.map((p) => [p.key, p]));

export function quotesFor(chain: ChainKey): QuoteAsset[] {
  return PAIR_ASSETS.filter((q) => q.chains.includes(chain));
}

export function featuredQuotes(chain: ChainKey): QuoteAsset[] {
  const order = chain === "arc" ? ["usdc", "znzf"] : ["eth", "usdg", "znzf", "nvda", "spy", "tsla", "aapl", "sgov", "pons"];
  const set = new Set(order);
  const featured = quotesFor(chain).filter((q) => set.has(q.key));
  featured.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return featured;
}

export function defaultQuote(chain: ChainKey): QuoteKey {
  return chain === "arc" ? "usdc" : "eth";
}

export function quoteOf(key: string | null | undefined, chain?: ChainKey): QuoteAsset {
  if (key) {
    const q = BY_KEY.get(key.toLowerCase());
    if (q && (!chain || q.chains.includes(chain))) return q;
  }
  return BY_KEY.get(defaultQuote(chain ?? "robinhood"))!;
}

export function pairLabel(symbol: string, quote: QuoteAsset | QuoteKey, sep: "/" | " " = "/") {
  const q = typeof quote === "string" ? quoteOf(quote) : quote;
  const ticker = (symbol || "TOKEN").replace(/^\$+/, "").toUpperCase();
  const quoteSym = q.pair.replace(/^\$+/, "");
  return `${ticker}${sep}${quoteSym}`;
}

export function isQuoteKey(value: string): boolean {
  return BY_KEY.has(value.toLowerCase());
}

export function chainGasQuote(chain: ChainKey): QuoteKey {
  return CHAINS[chain].gas === "USDC" ? "usdc" : "eth";
}

export function quoteAddress(asset: QuoteAsset, chain: ChainKey): `0x${string}` | "0x0000000000000000000000000000000000000000" {
  if (asset.native) return "0x0000000000000000000000000000000000000000";
  const addr = asset.address[chain];
  if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr as `0x${string}`;
  return "0x0000000000000000000000000000000000000000";
}

export function pairExplorer(asset: QuoteAsset, chain: ChainKey): string | null {
  const addr = asset.native ? asset.address[chain] : asset.address[chain];
  if (!addr) return null;
  return `${CHAINS[chain].explorer}/token/${addr}`;
}

const LOGO_EXT: Record<string, string> = { pons: "webp", slv: "svg" };

/** One real mark per asset. ZNZF uses its own brand file. Never a shared letter circle. */
export function quoteLogoPath(key: QuoteKey): string {
  const id = key.toLowerCase();
  if (id === "znzf") return "/brand/capy-mark-64.png";
  return `/quotes/${id}.${LOGO_EXT[id] ?? "png"}`;
}
