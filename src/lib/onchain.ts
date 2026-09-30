import published from "./onchain.json";

/** Canonical treasury / deployer. Always on the desk allowlist. */
export const TREASURY_WALLET = "0x426b74d42607ae5484909dabfd3deb76db480f8e";

/**
 * Drained contracts. The supply was taken. These addresses must never be
 * treated as the live protocol token, curve, vault, factory, or bridge.
 */
export const RETIRED_ZNZF_ROBINHOOD = "0x4BB3Ceedc9961865940687DeFead4abc5390F4d6";
export const RETIRED_ZNZF_ARC = "0x53eFF260FBf41530B345e70ae42042FD274aCBc6";
export const RETIRED_ZNZF_CURVE = "0x0DD4c1532672698183D847CCd6b3A12c55F9385D";

const RETIRED_ADDRESSES = new Set(
  [
    RETIRED_ZNZF_ROBINHOOD,
    RETIRED_ZNZF_ARC,
    RETIRED_ZNZF_CURVE,
    "0x1f360c80C6160743C2b9d3A7B411A1177bbFbA3D",
    "0x6074E1Ada803fFfA96E48921ff12Dd1703ae371E",
    "0x4Cb8bA8d05337a0c7444812Ab3253C06b0E9a564",
    "0xc19d678f484957173e90bdf7f79218e8d1f884f1",
    "0x6E3Ed7c4FD360D8141E001D30cB18BeE7Bd8F81e",
    "0x8c1b7EE09cDB14b60B53CF8113E869425bC4B969",
    "0x8E337979730107df8124F144bCcE60274a285537",
    "0x8CafD2398632dA848BE61784182b4257D0eF1A4a",
    "0x92b3db1738bED8AD7DaBBDBB0F0732D47c4695a1",
  ].map((a) => a.toLowerCase()),
);

/** Empty until a new deploy is published. Do not point these at the retired contracts. */
export const ZNZF_ROBINHOOD = "";
export const ZNZF_ARC = "";
export const ZNZF_CURVE_ROBINHOOD = "";

/** Previous factories are not indexed. A fresh factory replaces them. */
export const FACTORY_LEGACY: Record<"robinhood" | "arc", readonly string[]> = {
  robinhood: [],
  arc: [],
};

export type ChainDeploy = {
  znzf: string;
  vault: string;
  factory: string;
  bridge: string;
  curve?: string;
  buyback?: string;
  intake?: string;
  splitter?: string;
  migrator?: string;
  stake?: string;
  router?: string;
  drop?: string;
  retiredZnff?: string;
  unusedZnff?: string;
  kind?: "canonical" | "bridged";
  txs?: Record<string, string>;
};

export function isLiveAddress(value?: string | null): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value) && !isRetiredAddress(value));
}

export function isRetiredAddress(value?: string | null): boolean {
  return Boolean(value && RETIRED_ADDRESSES.has(value.trim().toLowerCase()));
}

/** Canonical $ZNZF curve on a chain, if published. Arc is bridged-only until a curve is listed. */
export function publishedZnzfCurve(chain?: string | null): string | null {
  const key = chain === "arc" ? "znzf_curve_arc" : "znzf_curve_robinhood";
  const addr = publishedConfig()[key];
  return isLiveAddress(addr) ? addr.toLowerCase() : null;
}

export function publishedConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  const data = published as {
    deployer?: string;
    canonicalChain?: string;
    totalSupply?: string;
    robinhood?: ChainDeploy | null;
    arc?: ChainDeploy | null;
  };
  const deployer = isLiveAddress(data.deployer) ? data.deployer.toLowerCase() : TREASURY_WALLET;
  out.deployer = deployer;
  if (data.canonicalChain) out.canonical_chain = data.canonicalChain;
  if (data.totalSupply) out.total_supply = data.totalSupply;
  for (const chain of ["robinhood", "arc"] as const) {
    const d = data[chain];
    if (!d) continue;
    if (isLiveAddress(d.znzf)) out[`znzf_${chain}`] = d.znzf.toLowerCase();
    if (isLiveAddress(d.vault)) out[`vault_${chain}`] = d.vault.toLowerCase();
    if (isLiveAddress(d.factory)) out[`factory_${chain}`] = d.factory.toLowerCase();
    if (isLiveAddress(d.bridge)) out[`bridge_${chain}`] = d.bridge.toLowerCase();
    if (isLiveAddress(d.curve)) out[`znzf_curve_${chain}`] = d.curve.toLowerCase();
    if (isLiveAddress(d.buyback)) out[`buyback_${chain}`] = d.buyback.toLowerCase();
    if (isLiveAddress(d.intake)) out[`intake_${chain}`] = d.intake.toLowerCase();
    if (isLiveAddress(d.splitter)) out[`splitter_${chain}`] = d.splitter.toLowerCase();
    if (isLiveAddress(d.stake)) out[`stake_${chain}`] = d.stake.toLowerCase();
    if (isLiveAddress(d.router)) out[`router_${chain}`] = d.router.toLowerCase();
    if (isLiveAddress(d.drop)) out[`drop_${chain}`] = d.drop.toLowerCase();
    if (isLiveAddress(d.retiredZnff)) out[`znzf_${chain}_retired`] = d.retiredZnff.toLowerCase();
    if (isLiveAddress(d.unusedZnff)) out[`znzf_${chain}_unused`] = d.unusedZnff.toLowerCase();
    if (isLiveAddress(d.migrator)) out.znzf_v4_migrator = d.migrator.toLowerCase();
    if (d.kind) out[`znzf_${chain}_kind`] = d.kind;
  }
  return out;
}
