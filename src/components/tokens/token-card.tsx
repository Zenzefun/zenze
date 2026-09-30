import { Link } from "@tanstack/react-router";
import { ChainMark } from "@/components/chains/chain-mark";
import { QuoteMark } from "@/components/chains/quote-mark";
import { Badge } from "@/components/ui/badge";
import { asNumber, formatCompact, formatMcap, formatUsdMaybe } from "@/lib/format";
import { pairLabel } from "@/lib/pairs";
import { TokenImage } from "@/components/media/smart-image";
import { hasQuotedPool, isGraduatedPool, isProtocolToken } from "@/lib/pool";
import { isZnzfRef, tokenRouteId } from "@/lib/token-path";
import type { EnrichedToken } from "@/lib/server/market";

type Enriched = EnrichedToken;

const CARD_CLASS =
  "stone-card group flex flex-col rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5";

export function TokenCard({ token }: { token: Enriched }) {
  const body = <TokenCardBody token={token} />;
  if (isProtocolToken(token) || isZnzfRef(token.id) || isZnzfRef(token.contract_address)) {
    return (
      <Link to="/znzf" className={CARD_CLASS}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/token/$id" params={{ id: tokenRouteId(token) }} className={CARD_CLASS}>
      {body}
    </Link>
  );
}

function TokenCardBody({ token }: { token: Enriched }) {
  const volNative = asNumber(token.volume_24h);
  const volUsd =
    token.quote.key === "eth"
      ? token.ethUsd != null
        ? volNative * token.ethUsd
        : null
      : volNative;
  const live = hasQuotedPool(token);
  const graduated = isGraduatedPool(token);
  const protocol = isProtocolToken(token);

  return (
    <>
      <div className="flex items-start gap-3">
        <TokenImage src={token.image_url} alt={token.name} size={48} seed={token.id} protocol={protocol} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{token.name}</p>
            <span className="text-xs text-muted-foreground">${token.symbol}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="steam" className="gap-1">
              <ChainMark chain={token.chain.key} className="size-3" />
              {token.chain.short}
            </Badge>
            {live && (
              <Badge variant="outline" className="gap-1">
                <QuoteMark quote={token.quote.key} className="size-3" />
                {pairLabel(token.symbol, token.quote)}
              </Badge>
            )}
            <Badge variant={token.band.key === "storm" ? "blossom" : token.band.key === "calm" ? "moss" : "sand"}>
              {token.band.label}
            </Badge>
            {protocol && !graduated && <Badge variant="gold">Protocol</Badge>}
            {token.source === "listed" && !protocol && <Badge variant="gold">Listed</Badge>}
            {graduated && <Badge variant="gold">Graduated</Badge>}
          </div>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{token.description}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Mcap</dt>
          <dd className="font-medium tabular-nums">{live ? formatMcap(token.mcap, token.priceUsd, token.quote.symbol) : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Volume</dt>
          <dd className="font-medium tabular-nums">{volUsd != null ? formatUsdMaybe(volUsd) : formatCompact(volNative)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Holders</dt>
          <dd className="font-medium tabular-nums">{token.holders.toLocaleString()}</dd>
        </div>
      </dl>
    </>
  );
}
