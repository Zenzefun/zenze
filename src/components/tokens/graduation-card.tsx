import { Progress } from "@/components/ui/progress";
import { formatEth } from "@/lib/format";
import { isProtocolToken } from "@/lib/pool";
import type { EnrichedToken } from "@/lib/server/market";

export function GraduationCard({ token }: { token: EnrichedToken }) {
  if (token.source === "listed") return null;
  const raised = token.curve.realBase;
  const target = token.graduation;
  const pct = target > 0 ? Math.min(100, Math.max(0, (raised / target) * 100)) : 0;
  const pctLabel = pct > 0 && pct < 10 ? pct.toFixed(2) : pct.toFixed(0);
  const quote = token.quote.symbol;
  const protocol = isProtocolToken(token);
  const arc = token.chain.key === "arc";

  if (protocol) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Bonding curve</p>
          <p className="text-sm font-semibold tabular-nums">{pctLabel}% of {formatEth(target)} {quote}</p>
        </div>
        <Progress value={pct} className="mt-3" barClassName={token.band.barClass} />
        <p className="mt-2 text-sm text-muted-foreground">
          {formatEth(raised)} of {formatEth(target)} {quote} in real reserves. New buys stop at that mark. This curve does not move to Uniswap.
        </p>
      </div>
    );
  }

  if (token.graduated) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Bonding curve</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">Closed</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {arc
            ? `The curve closed at ${formatEth(target)} ${quote}. This app does not migrate Arc curves to Uniswap.`
            : `The curve closed at ${formatEth(target)} ${quote}. Remaining reserves go to Uniswap v4 only after a migrator is set and someone calls migrate().`}
        </p>
        <Progress value={100} className="mt-3" barClassName={token.band.barClass} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Bonding curve</p>
        <p className="text-sm font-semibold tabular-nums">{pctLabel}% to close</p>
      </div>
      <Progress value={pct} className="mt-3" barClassName={token.band.barClass} />
      <p className="mt-2 text-sm text-muted-foreground">
        {formatEth(raised)} of {formatEth(target)} {quote} raised. At the threshold, buy and sell stop.
        {arc
          ? " This app does not migrate Arc curves to Uniswap."
          : " On Robinhood, remaining reserves go to Uniswap v4 only if a migrator is set and someone calls migrate()."}
      </p>
    </div>
  );
}