import { Link } from "@tanstack/react-router";
import { ChainMark } from "@/components/chains/chain-mark";
import { QuoteMark } from "@/components/chains/quote-mark";
import { Badge } from "@/components/ui/badge";
import { asNumber, formatCompact, formatMcap, formatUsdMaybe } from "@/lib/format";
import { pairLabel } from "@/lib/pairs";
import { TokenImage } from "@/components/media/smart-image";
import { hasQuotedPool, tokenBoardKind } from "@/lib/pool";
import { isZnzfRef, tokenRouteId } from "@/lib/token-path";
import type { EnrichedToken } from "@/lib/server/market";

type Enriched = EnrichedToken;

const CARD_CLASS =
  "stone-card group flex h-full flex-col overflow-hidden rounded-xl p-4";

export function TokenCard({ token, showDescription = true }: { token: Enriched; showDescription?: boolean }) {
  const body = <TokenCardBody token={token} showDescription={showDescription} />;
  if (isZnzfRef(token.id) || isZnzfRef(token.contract_address)) {
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

function TokenCardBody({ token, showDescription }: { token: Enriched; showDescription: boolean }) {
  const volNative = asNumber(token.volume_24h);
  const volUsd =
    token.quote.key === "eth" ? (token.ethUsd != null ? volNative * token.ethUsd : null) : volNative;
  const live = hasQuotedPool(token);
  const kind = tokenBoardKind(token);
  const onCurve = kind === "curve" || kind === "protocol";
  const progress = onCurve ? Math.max(0, Math.min(100, token.progress || 0)) : 100;

  return (
    <>
      <div className="flex items-center gap-3">
        <TokenImage
          src={token.image_url}
          alt={token.name}
          size={48}
          seed={token.id}
          protocol={kind === "protocol"}
          className="size-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate font-medium">{token.name}</p>
            <span className="shrink-0 text-xs text-muted-foreground">${token.symbol}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="steam" className="gap-1">
              <ChainMark chain={token.chain.key} className="size-3" />
              {token.chain.short}
            </Badge>
            {live ? (
              <Badge variant="outline" className="gap-1">
                <QuoteMark quote={token.quote.key} className="size-3" />
                {pairLabel(token.symbol, token.quote)}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{onCurve ? "Filled" : "Uniswap"}</span>
          <span className="tabular-nums">{onCurve ? `${progress.toFixed(0)}%` : "Live"}</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`fill-bar h-full rounded-full ${onCurve ? "bg-moss" : "bg-foreground/35"}`}
            style={{ width: `${Math.max(progress, onCurve ? 2 : 100)}%` }}
          />
        </div>
      </div>
      {showDescription ? (
        <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{token.description || "\u00a0"}</p>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Market cap</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {live || token.dex ? formatMcap(token.mcap, token.priceUsd, token.quote.symbol) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">24h volume</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {volUsd != null ? formatUsdMaybe(volUsd) : formatCompact(volNative)}
          </dd>
        </div>
      </dl>
    </>
  );
}
