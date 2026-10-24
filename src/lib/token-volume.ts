import { asNumber } from "@/lib/format";
import type { EnrichedToken } from "@/lib/server/market";

/**
 * 24h volume in USD for a board row.
 *
 * Listed (and graduated) tokens carry a Uniswap pool snapshot in `token.dex`. For those the
 * server stores `volume_24h = dex.volumeUsd`, which is already USD — multiplying it by the ETH
 * price again inflated $AI from ~$2.85M to ~$7.1B. Curve tokens still store native quote units.
 */
export function tokenVolumeUsd(token: EnrichedToken): number | null {
  const dex = token.dex as { volumeUsd?: unknown } | null | undefined;
  if (dex || (token as { source?: string }).source === "listed") {
    const fromDex = Number(dex?.volumeUsd);
    if (Number.isFinite(fromDex)) return fromDex;
    return asNumber(token.volume_24h);
  }
  const native = asNumber(token.volume_24h);
  if (token.quote?.key === "eth") return token.ethUsd != null ? native * token.ethUsd : null;
  return native;
}
