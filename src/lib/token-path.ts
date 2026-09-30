import { getAddress } from "viem";
import { ZNZF_ID } from "./chains";
import { isHexAddress } from "./intent";
import { ZNZF_ARC, ZNZF_ROBINHOOD, isRetiredAddress, publishedConfig } from "./onchain";

export function checksumAddress(value: string): string {
  try {
    return getAddress(value);
  } catch {
    return value;
  }
}

/** Canonical launchpad URL id — same pattern as Pons `/launchpad/0x…`. */
export function znzfLaunchpadId(): string {
  const live = publishedConfig().znzf_robinhood;
  if (isHexAddress(live) && !isRetiredAddress(live)) return checksumAddress(live);
  return "znzf";
}

/** Trade page for canonical $ZNZF. Prefer the contract path over /znzf. */
export function znzfTradePath(): string {
  const id = znzfLaunchpadId();
  return id.startsWith("0x") ? `/token/${id}` : "/znzf";
}

export function isZnzfRef(id: string | null | undefined): boolean {
  if (!id) return false;
  const x = id.trim().toLowerCase();
  const cfg = publishedConfig();
  return (
    x === ZNZF_ID ||
    (Boolean(ZNZF_ROBINHOOD) && x === ZNZF_ROBINHOOD.toLowerCase()) ||
    (Boolean(ZNZF_ARC) && x === ZNZF_ARC.toLowerCase()) ||
    isRetiredAddress(x) ||
    x === (cfg.znzf_robinhood ?? "").toLowerCase() ||
    x === (cfg.znzf_arc ?? "").toLowerCase()
  );
}

export function tokenRouteId(token: { id: string; contract_address?: string | null }): string {
  if (isZnzfRef(token.id) || isZnzfRef(token.contract_address ?? "")) {
    const live = znzfLaunchpadId();
    if (live.startsWith("0x")) return live;
  }
  if (isHexAddress(token.contract_address)) return checksumAddress(token.contract_address);
  return token.id;
}
