import { getSql } from "@/lib/db";
import { env } from "@/lib/env.server";
import { isRetiredAddress, publishedConfig } from "@/lib/onchain";

/** Keys that may be shown to the public site (never secrets). */
export const PUBLIC_CONFIG_KEYS = [
  "reown_project_id",
  "pinata_gateway",
  "maintenance",
  "maintenance_message",
  "robinhood_enabled",
  "arc_enabled",
  "x_handle",
] as const;

/** Protocol takes. Served via feeQuote; desk can rotate them. */
export const FEE_CONFIG_KEYS = ["launch_fee_usd", "listing_fee_usd"] as const;

/** Server-only keys. Desk can rotate them; they never go to publicConfig. */
export const SECRET_CONFIG_KEYS = [
  "pinata_jwt",
  "dune_api_key",
  "xai_api_key",
  "deepseek_api_key",
  "x_bearer_token",
  "x_api_key",
  "x_api_secret",
  "x_oauth_client_id",
  "x_oauth_client_secret",
  "twitterapis_key",
  "x_auth_token",
  "x_ct0",
  "telegram_bot_token",
  "telegram_chat_id",
] as const;

export const CONTRACT_CONFIG_KEYS = [
  "znzf_robinhood",
  "vault_robinhood",
  "factory_robinhood",
  "bridge_robinhood",
  "znzf_curve_robinhood",
  "buyback_robinhood",
  "intake_robinhood",
  "splitter_robinhood",
  "stake_robinhood",
  "router_robinhood",
  "drop_robinhood",
  "znzf_v4_migrator",
  "znzf_arc",
  "vault_arc",
  "factory_arc",
  "bridge_arc",
  "znzf_curve_arc",
  "treasury_address",
] as const;

/** Desk-only autonomous X controls. Never public. */
export const AUTO_CONFIG_KEYS = [
  "x_auto_on",
  "x_auto_minutes",
  "x_daily_likes",
  "x_daily_follows",
  "x_daily_reposts",
  "x_daily_comments",
  "x_auto_replies_on_our_posts",
  "x_auto_follows",
  "x_auto_quotes",
  "telegram_auto_on",
] as const;

/** Point weights for the drop. Tokens are the on-chain balance, split by points when it opens. */
export const DROP_CONFIG_KEYS = [
  "drop_buy",
  "drop_telegram",
  "drop_x",
  "drop_launch",
  "drop_seen",
  "drop_referral",
  "drop_referral_max",
  "drop_min_hold",
  "drop_hold_pct",
  "drop_spin",
  "drop_claims_open",
  "drop_claims_at",
] as const;

export const DESK_CONFIG_KEYS = [
  ...PUBLIC_CONFIG_KEYS,
  ...SECRET_CONFIG_KEYS,
  ...CONTRACT_CONFIG_KEYS,
  ...FEE_CONFIG_KEYS,
  ...AUTO_CONFIG_KEYS,
  ...DROP_CONFIG_KEYS,
] as const;

export type DeskConfigKey = (typeof DESK_CONFIG_KEYS)[number];
export type SecretConfigKey = (typeof SECRET_CONFIG_KEYS)[number];

const ENV_ALIAS: Record<string, string[]> = {
  reown_project_id: ["REOWN_PROJECT_ID", "VITE_REOWN_PROJECT_ID", "WALLETCONNECT_PROJECT_ID", "NEXT_PUBLIC_PROJECT_ID"],
  pinata_jwt: ["PINATA_JWT"],
  pinata_gateway: ["PINATA_GATEWAY"],
  dune_api_key: ["DUNE_API_KEY"],
  xai_api_key: ["XAI_API_KEY"],
  deepseek_api_key: ["DEEPSEEK_API_KEY"],
  x_bearer_token: ["X_BEARER_TOKEN", "TWITTER_BEARER_TOKEN", "X_ACCESS_TOKEN"],
  x_api_key: ["X_API_KEY", "TWITTER_API_KEY"],
  x_api_secret: ["X_API_SECRET", "TWITTER_API_SECRET"],
  x_oauth_client_id: ["X_OAUTH_CLIENT_ID"],
  x_oauth_client_secret: ["X_OAUTH_CLIENT_SECRET"],
  twitterapis_key: ["TWITTERAPIS_KEY", "TWITTERAPIS_API_KEY"],
  x_auth_token: ["X_AUTH_TOKEN", "TWITTER_AUTH_TOKEN"],
  x_ct0: ["X_CT0", "TWITTER_CT0"],
  telegram_bot_token: ["TELEGRAM_BOT_TOKEN"],
  telegram_chat_id: ["TELEGRAM_CHAT_ID"],
  x_handle: ["X_HANDLE"],
  x_auto_on: ["X_AUTO_ON"],
  x_auto_minutes: ["X_AUTO_MINUTES"],
  x_daily_likes: ["X_DAILY_LIKES"],
  x_daily_follows: ["X_DAILY_FOLLOWS"],
  x_daily_reposts: ["X_DAILY_REPOSTS"],
  x_daily_comments: ["X_DAILY_COMMENTS"],
};

const SECRET_SET = new Set<string>(SECRET_CONFIG_KEYS);
const ALLOWED_SET = new Set<string>(DESK_CONFIG_KEYS);
const PUBLIC_SET = new Set<string>(PUBLIC_CONFIG_KEYS);

export function isDeskConfigKey(key: string): key is DeskConfigKey {
  return ALLOWED_SET.has(key);
}

export function isSecretConfigKey(key: string): key is SecretConfigKey {
  return SECRET_SET.has(key);
}

export function isPublicConfigKey(key: string): boolean {
  return PUBLIC_SET.has(key);
}

export function isReownProjectId(value: string | undefined | null): value is string {
  return Boolean(value && /^[a-f0-9]{32}$/i.test(value.trim()));
}

function envFallback(key: string): string | undefined {
  for (const name of ENV_ALIAS[key] ?? []) {
    const v = env(name);
    if (v) return v;
  }
  return undefined;
}

let cache: { at: number; map: Record<string, string> } | null = null;
const CACHE_MS = 8_000;

export function invalidateDeskConfig() {
  cache = null;
}

/** Desk values overlay env. Empty DB rows fall through to env. Env fills empty DB rows. */
export async function loadDeskConfig(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const map: Record<string, string> = {};
  for (const key of DESK_CONFIG_KEYS) {
    const v = envFallback(key);
    if (v) map[key] = v;
  }
  try {
    const sql = await getSql();
    for (const key of Object.keys(ENV_ALIAS)) {
      const v = envFallback(key);
      if (!v) continue;
      await sql`
        insert into protocol_config (key, value) values (${key}, ${v})
        on conflict (key) do update set value = excluded.value
        where protocol_config.value is null or btrim(protocol_config.value) = ''
      `;
    }
    const rows = await sql<{ key: string; value: string }>`select key, value from protocol_config`;
    for (const r of rows) {
      if (!ALLOWED_SET.has(r.key)) continue;
      const v = r.value?.trim();
      if (!v || isRetiredAddress(v)) continue;
      map[r.key] = v;
    }
  } catch {
    // table may not exist yet
  }
  cache = { at: Date.now(), map };
  return cache.map;
}

export async function configValue(key: string): Promise<string | undefined> {
  const map = await loadDeskConfig();
  const v = map[key]?.trim();
  return v || undefined;
}

/** Published on-chain.json, then desk overrides (factory, curve, fees). */
export async function liveProtocolConfig(): Promise<Record<string, string>> {
  const out = { ...publishedConfig() };
  const desk = await loadDeskConfig();
  for (const key of [...PUBLIC_CONFIG_KEYS, ...CONTRACT_CONFIG_KEYS, ...FEE_CONFIG_KEYS]) {
    if (desk[key]) out[key] = desk[key];
  }
  return out;
}

export function maskSecret(value: string | undefined): { set: boolean; hint: string } {
  if (!value) return { set: false, hint: "" };
  if (value.length <= 8) return { set: true, hint: "•••• set" };
  return { set: true, hint: `${value.slice(0, 4)}…${value.slice(-4)}` };
}
