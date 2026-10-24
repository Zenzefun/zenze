import { Link } from "@tanstack/react-router";
import { GraduationCap, Star } from "lucide-react";
import { ChainMark } from "@/components/chains/chain-mark";
import { TokenImage } from "@/components/media/smart-image";
import { formatUsdCompact } from "@/lib/format";
import { tokenRouteId } from "@/lib/token-path";
import { curveStage } from "@/lib/token-stage";
import { cn } from "@/lib/utils";
import type { EnrichedToken } from "@/lib/server/market";

export type FeaturedReason = "graduating" | "quest" | "new";

const REASON_LABEL: Record<FeaturedReason, string> = {
  graduating: "About to graduate",
  quest: "Featured · Creator Quest",
  new: "Featured · New launch",
};

export function FeaturedToken({
  token,
  className,
  reason = "graduating",
}: {
  token: EnrichedToken;
  className?: string;
  reason?: FeaturedReason;
}) {
  const Icon = reason === "graduating" ? GraduationCap : Star;
  const stage = curveStage(token);
  const fresh = stage.progress < 1;
  return (
    <Link
      to="/token/$id"
      params={{ id: tokenRouteId(token as never) }}
      className={cn(
        "stone-card group flex min-w-0 flex-col gap-3 rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-5 sm:p-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <TokenImage src={token.image_url} alt="" size={56} seed={token.id} className="size-14 shrink-0" />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-gold uppercase">
            <Icon className="size-4" aria-hidden />
            {REASON_LABEL[reason]}
          </p>
          <p className="truncate text-lg font-semibold">
            {token.name} <span className="text-muted-foreground">${token.symbol}</span>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ChainMark chain={token.chain.key} className="size-3" />
            {token.chain.short ?? token.chain.name}
            {token.priceUsd != null && token.mcap > 0 ? <span>· MC {formatUsdCompact(token.mcap)}</span> : null}
          </p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{fresh ? "The curve just opened" : "Curve filled"}</span>
          <span className="font-medium tabular-nums text-foreground">{fresh ? "Be early" : `${stage.progress.toFixed(0)}%`}</span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full bg-moss", fresh && "animate-pulse")} style={{ width: `${Math.max(stage.progress, 3)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {fresh
            ? "Nobody has filled this pool yet. Every buy moves it toward Uniswap."
            : "When the curve reaches 100% the pool graduates to Uniswap."}
        </p>
      </div>
      <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-gold px-5 text-sm font-medium text-ink group-hover:opacity-92">
        Trade ${token.symbol}
      </span>
    </Link>
  );
}
