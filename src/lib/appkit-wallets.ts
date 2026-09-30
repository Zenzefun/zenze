/**
 * WalletGuide ids for Reown AppKit (featuredWalletIds).
 * Named ids for useAppKitWallet().connect() live in APPKIT_NAMED_WALLETS.
 * @see https://docs.reown.com/appkit/react/core/options#featuredwalletids
 * @see https://walletguide.walletconnect.network
 * @see github.com/reown-com/skills
 */
export const FEATURED_WALLET_IDS = [
  "971e689d0a5be527bac79629b4ee9b925e82208e5168b733496a09c0faed0709", // OKX
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust
  "8a0ee50d1f22f6651afcae7eb4253e52a3310b90af5daef78a8c4929a9bb99d4", // Binance
  "38f5d18bd8522c244bdd70cb4a68e0e718865155811c043f052fb9f1c51de662", // Bitget
  "fd20dc426fb37544d338b4053026c721a682cb6243b61e6ea6ea714750550784", // Coinbase Wallet
  "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369", // Rainbow
  "20459438007b75f4f4acb98bf29aa3b800550309646d375da5fd4aac6c2a2c66", // TokenPocket
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
] as const;

/** Names accepted by useAppKitWallet().connect() — never a WalletConnect.com URL. */
export const APPKIT_NAMED_WALLETS = [
  "okx",
  "metamask",
  "trust",
  "binance",
  "bitget",
  "coinbase",
  "rainbow",
  "tokenpocket",
  "phantom",
  "uniswap",
  "zerion",
  "safe",
  "ledger",
  "safepal",
  "oneinch",
  "exodus",
  "argent",
  "brave",
  "kraken",
  "crypto-com",
  "coin98",
  "backpack",
  "robinhood",
  "bybit",
  "imtoken",
  "walletConnect",
] as const;

export type AppKitNamedWallet = (typeof APPKIT_NAMED_WALLETS)[number];

export function isAppKitNamedWallet(id: string): id is AppKitNamedWallet {
  return (APPKIT_NAMED_WALLETS as readonly string[]).includes(id);
}

/**
 * No custom wallet rows. OKX is already the first featured WalletGuide id.
 * A custom row with that same id is rendered again beside it.
 */
export const APPKIT_CUSTOM_WALLETS: [] = [];
