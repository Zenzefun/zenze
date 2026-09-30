export type ChainKey = "robinhood" | "arc";

export type ChainInfo = {
  key: ChainKey;
  name: string;
  short: string;
  compact: string;
  id: number;
  hexId: string;
  gas: string;
  gasName: string;
  decimals: number;
  finality: string;
  colorClass: string;
  explorer: string;
  rpc: string;
};

/** Official mainnet params — Robinhood docs + Circle Arc RPC reference. */
export const CHAINS: Record<ChainKey, ChainInfo> = {
  robinhood: {
    key: "robinhood",
    name: "Robinhood Chain",
    short: "Robinhood",
    compact: "RH",
    id: 4663,
    hexId: "0x1237",
    gas: "ETH",
    gasName: "Ether",
    decimals: 18,
    finality: "Arbitrum Orbit L2",
    colorClass: "bg-steam/40 text-stone",
    explorer: "https://robinhoodchain.blockscout.com",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
  },
  arc: {
    key: "arc",
    name: "Arc",
    short: "Arc",
    compact: "Arc",
    id: 5042,
    hexId: "0x13b2",
    gas: "USDC",
    gasName: "USD Coin",
    decimals: 18,
    finality: "Circle L1 · USDC gas",
    colorClass: "bg-moss/20 text-stone",
    explorer: "https://explorer.arc.io",
    rpc: "https://rpc.mainnet.arc.io",
  },
};

export function chainById(id: number | null): ChainInfo | null {
  if (id == null) return null;
  return Object.values(CHAINS).find((c) => c.id === id) ?? null;
}

export const LISTING_REFERRAL_BPS = 1000;
export const TRADE_FEE_BPS = 200;
/** Legacy curves split 70% of the 2% fee to the creator. New launches cap creator tax at 10% of that fee. */
export const CREATOR_SHARE_BPS = 7000;
export const MAX_CREATOR_TAX_BPS = 1000;
export const DEFAULT_CREATOR_TAX_BPS = 1000;
export const PROTOCOL_BUYBACK_BPS = 8000;
export const GRADUATION_ETH = 2;
export const VIRTUAL_BASE = 30;
export const VIRTUAL_TOKENS = 1_073_000_000;
export const TOTAL_SUPPLY = 1_000_000_000;
export const ZNZF_ID = "znzf";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Live Uniswap v4 on Robinhood Chain (4663). Arc has no published PoolManager in this app. */
export const UNISWAP_V4 = {
  robinhood: {
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
    stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
    quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
    universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  },
} as const;
