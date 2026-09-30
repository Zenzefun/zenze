import { defineChain } from "@reown/appkit/networks";
import { CHAINS } from "@/lib/chains";

/** Robinhood Chain — not in Reown’s built-in list. CAIP-2 eip155:4663. */
export const robinhoodNetwork = defineChain({
  id: CHAINS.robinhood.id,
  caipNetworkId: "eip155:4663",
  chainNamespace: "eip155",
  name: CHAINS.robinhood.name,
  nativeCurrency: {
    decimals: CHAINS.robinhood.decimals,
    name: CHAINS.robinhood.gasName,
    symbol: CHAINS.robinhood.gas,
  },
  rpcUrls: {
    default: { http: [CHAINS.robinhood.rpc] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: CHAINS.robinhood.explorer },
  },
});

/** Arc (Circle) — CAIP-2 eip155:5042. Native gas is USDC. */
export const arcNetwork = defineChain({
  id: CHAINS.arc.id,
  caipNetworkId: "eip155:5042",
  chainNamespace: "eip155",
  name: CHAINS.arc.name,
  nativeCurrency: {
    decimals: CHAINS.arc.decimals,
    name: CHAINS.arc.gasName,
    symbol: CHAINS.arc.gas,
  },
  rpcUrls: {
    default: { http: [CHAINS.arc.rpc] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: CHAINS.arc.explorer },
  },
});

export const appkitNetworks = [robinhoodNetwork, arcNetwork] as [
  typeof robinhoodNetwork,
  typeof arcNetwork,
];
