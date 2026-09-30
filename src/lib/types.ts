import type { ChainKey } from "./chains";
import type { QuoteKey } from "./pairs";

export type TokenSource = "launched" | "listed" | "protocol";

export type TokenRow = {
  id: string;
  name: string;
  symbol: string;
  description: string;
  image_url: string;
  creator_wallet: string;
  chain: ChainKey;
  quote_asset?: QuoteKey | string | null;
  virtual_base: string | number;
  virtual_tokens: string | number;
  real_base: string | number;
  tokens_sold: string | number;
  total_supply: string | number;
  holders: number;
  volume_24h: string | number;
  health_score: number;
  rug_probability: number;
  graduated: boolean;
  created_at: string;
  source?: TokenSource | string;
  contract_address?: string | null;
  curve_address?: string | null;
  quote_address?: string | null;
  tx_hash?: string | null;
  fee_bps?: number | null;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  creator_tax_bps?: number | null;
  holder_sharing?: boolean | null;
};

export type TradeRow = {
  id: number;
  token_id: string;
  wallet: string;
  side: "buy" | "sell";
  base_amount: string | number;
  token_amount: string | number;
  price: string | number;
  created_at: string;
};

export type HoldingRow = {
  wallet: string;
  token_id: string;
  amount: string | number;
};

export type ProtocolStats = {
  tokens: number;
  listed: number;
  volumeNative: number;
  volumeUsd: number | null;
  holders: number;
  znzfPriceUsd: number | null;
  znzfPriceNative: number | null;
  znzfHolders: number;
  burned: number;
  tvlNative: number;
  tvlUsd: number | null;
  ethUsd: number | null;
  feesAccrued: number;
  stakeApy: number | null;
  totalStaked: number;
};

export type AdminRole = "super_admin" | "moderator" | "analyst";
