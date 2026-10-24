import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { asNumber, formatUsdCompact, formatUsdTiny, timeAgo } from "@/lib/format";
import { listTrades } from "@/lib/server/market";
import { cn } from "@/lib/utils";
import type { EnrichedToken } from "@/lib/server/market";

type TradeRow = { id?: string | number; token_id: unknown; side?: unknown; symbol?: string; base_amount?: unknown; created_at?: string | Date };

function usdOf(trade: TradeRow, token: EnrichedToken | undefined) {
  if (!token) return null;
  const t = token as EnrichedToken & { quoteUsd?: number | null };
  const unit = t.quoteUsd ?? (t.quote?.key === "eth" ? t.ethUsd : null);
  if (unit == null) return null;
  return asNumber(trade.base_amount as never) * Number(unit);
}

/** Recent buys and sells from the existing trades feed. Client-only, so it never delays first byte. */
export function TradeTicker({ tokens, className }: { tokens: EnrichedToken[]; className?: string }) {
  const trades = useQuery({ queryKey: ["recent-trades"], queryFn: () => listTrades(), refetchInterval: 20_000, staleTime: 15_000 });
  const byId = new Map(tokens.map((t) => [String(t.id), t]));
  const rows = ((trades.data ?? []) as unknown as TradeRow[]).slice(0, 16);
  if (trades.isError || (trades.isSuccess && rows.length === 0)) return null;
  const renderItems = (dup: boolean) =>
    rows.map((trade, i) => {
      const usd = usdOf(trade, byId.get(String(trade.token_id)));
      const buy = String(trade.side).toLowerCase() === "buy";
      return (
        <li key={`${dup ? "dup-" : ""}${trade.id ?? i}`} aria-hidden={dup || undefined} className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap">
          <span className={cn("rounded-full px-1.5 py-0.5 font-medium", buy ? "bg-moss/15 text-moss" : "bg-gold/15 text-stone")}>
            {buy ? "Buy" : "Sell"}
          </span>
          <span className="font-medium">${trade.symbol}</span>
          {usd != null && usd > 0 ? <span className="tabular-nums">{usd >= 1 ? formatUsdCompact(usd) : formatUsdTiny(usd)}</span> : null}
          {trade.created_at ? <span className="text-muted-foreground">{timeAgo(trade.created_at)}</span> : null}
        </li>
      );
    });
  return (
    <section aria-label="Recent trades" className={cn("stone-card flex min-w-0 items-center gap-3 overflow-hidden rounded-full py-2 pr-2 pl-3", className)}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-stone">
        <Activity className="size-3.5 text-moss" aria-hidden />
        Live
      </span>
      {trades.isPending ? (
        <span className="h-4 flex-1 animate-pulse rounded-full bg-muted" aria-hidden />
      ) : (
        <div className="ticker-mask min-w-0 flex-1 overflow-hidden">
          <ul className="ticker-track flex w-max gap-5 pr-5">
            {renderItems(false)}
            {renderItems(true)}
          </ul>
        </div>
      )}
    </section>
  );
}
