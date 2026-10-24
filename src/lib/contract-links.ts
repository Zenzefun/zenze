import type { ChainKey } from "@/lib/chains";
import { publishedConfig } from "@/lib/onchain";

export type ContractLink = { label: string; chain: ChainKey; address: string };

/** Live contracts from the published deploy file (onchain.json). Nothing is hard-coded twice. */
export function publishedContractLinks(): ContractLink[] {
  const cfg = publishedConfig();
  const rows: ContractLink[] = [];
  for (const chain of ["robinhood", "arc"] as const) {
    if (cfg[`znzf_${chain}`]) rows.push({ label: "$ZNZF", chain, address: cfg[`znzf_${chain}`] });
  }
  for (const chain of ["robinhood", "arc"] as const) {
    if (cfg[`factory_${chain}`]) rows.push({ label: "Launch factory", chain, address: cfg[`factory_${chain}`] });
  }
  return rows;
}
