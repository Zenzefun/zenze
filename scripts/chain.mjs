import { defineChain } from "viem";

/** Robinhood Chain mainnet — default deploy target. */
export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
});

/**
 * Elysium Testnet (Kinetiq / Hyperliquid L2).
 * Official: https://elysium.kinetiq.xyz/docs/connecting-to-elysium
 * Chain ID 99801 · RPC https://testnet-rpc.elysium.kinetiq.xyz · gas HYPE
 */
export const elysiumTestnet = defineChain({
  id: 99801,
  name: "Elysium Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.elysium.kinetiq.xyz"] } },
  blockExplorers: {
    default: { name: "Elysium Explorer", url: "https://testnet.elysium.kinetiq.xyz" },
  },
  testnet: true,
});

/**
 * QMS Testnet.
 * Official: https://docs.qms.finance/onboarding/
 * Chain ID 19480 · RPC https://rpc.testnet.qms.finance · gas QMS
 */
export const qmsTestnet = defineChain({
  id: 19480,
  name: "QMS Testnet",
  nativeCurrency: { name: "QMS", symbol: "QMS", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.qms.finance"] } },
  blockExplorers: {
    default: { name: "QMSScan", url: "https://testnet.qmsscan.io" },
  },
  testnet: true,
});

/** Named chains selectable via ZENZE_CHAIN / CHAIN env. */
export const chains = {
  robinhood,
  elysium: elysiumTestnet,
  elysiumTestnet,
  qms: qmsTestnet,
  qmsTestnet,
};

/**
 * Resolve a chain by env or explicit name. Default: robinhood.
 * Env: ZENZE_CHAIN or CHAIN (e.g. robinhood | elysium | elysiumTestnet | qms | qmsTestnet)
 */
export function getChain(name = process.env.ZENZE_CHAIN || process.env.CHAIN || "robinhood") {
  const key = String(name ?? "robinhood").trim();
  const chain = chains[key] ?? chains[key.toLowerCase()];
  if (!chain) {
    const known = [...new Set(Object.keys(chains))].join(", ");
    throw new Error(`Unknown chain "${name}". Use one of: ${known}`);
  }
  return chain;
}

export default getChain();
