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
  const closed = Boolean(token.graduated) || (target > 0 && raised >= target);
  const mark = `${formatEth(target)} ${quote}`;
  const raisedLine = `${formatEth(raised)} of ${mark} raised.`;
  const note = isProtocolToken(token)
    ? `${raisedLine} At ${mark} buying stops on its own. This pool stays on Zenzen.`
    : closed
      ? `${raisedLine} The curve has closed and the liquidity moves to a Uniswap v4 pool on its own.`
      : `${raisedLine} At the threshold the curve closes and liquidity moves to a Uniswap v4 pool.`;

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Reserves</p>
        <p className="text-sm font-semibold tabular-nums">{closed ? "Full" : `${pctLabel}%`}</p>
      </div>
      <Progress value={closed ? 100 : pct} className="mt-3" barClassName={token.band.barClass} />
      <p className="mt-2 text-sm text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
