import { LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChainMark } from "@/components/chains/chain-mark";
import { TokenImage } from "@/components/media/smart-image";
import { TokenCard } from "@/components/tokens/token-card";
import { Button } from "@/components/ui/button";
import { asNumber, formatCompact, formatMcap, formatUsdCompact, formatUsdMaybe } from "@/lib/format";
import { pairLabel } from "@/lib/pairs";
import { hasQuotedPool, tokenBoardKind } from "@/lib/pool";
import { isZnzfRef, tokenRouteId } from "@/lib/token-path";
import { curveStage } from "@/lib/token-stage";
import { tokenVolumeUsd } from "@/lib/token-volume";
import { cn } from "@/lib/utils";
import type { EnrichedToken } from "@/lib/server/market";

type Lane = "all" | "curve" | "near" | "graduated" | "listed";
type Sort = "new" | "mcap" | "volume";

const LANES: { id: Lane; label: string }[] = [
  { id: "all", label: "All" },
  { id: "curve", label: "On the curve" },
  { id: "near", label: "About to graduate" },
  { id: "graduated", label: "Graduated" },
  { id: "listed", label: "Listed" },
];

const NOTES: Record<Lane, string> = {
  all: "Fresh launches first. Each row shows where its pool is: on the curve, graduated, or listed on Uniswap.",
  curve: "You can still buy and sell these here.",
  near: "The pool is past 70%. Buying stops when it fills.",
  graduated: "The pool filled. Trading moved to Uniswap.",
  listed: "Already on Uniswap. Swap it here, in that same pool.",
};

function laneOf(token: EnrichedToken): Exclude<Lane, "all" | "near"> {
  const kind = tokenBoardKind(token);
  if (kind === "listed") return "listed";
  if (kind === "graduated") return "graduated";
  return "curve";
}

const volumeUsd = tokenVolumeUsd;

/** Phone-friendly market cap: compact USD when priced, else the native figure. */
function mcapShort(token: EnrichedToken, live: boolean) {
  if (!live && !token.dex) return "—";
  if (token.priceUsd != null && Number.isFinite(token.priceUsd)) return formatUsdCompact(token.mcap);
  return formatMcap(token.mcap, token.priceUsd, token.quote.symbol);
}

function volumeLabel(token: EnrichedToken, short = false) {
  const vol = volumeUsd(token);
  if (vol == null) return formatCompact(asNumber(token.volume_24h));
  if (vol <= 0) return "$0";
  return short ? formatUsdCompact(vol) : formatUsdMaybe(vol);
}

function age(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function TokenBoard({ tokens }: { tokens: EnrichedToken[]; showDescription?: boolean }) {
  const [lane, setLane] = useState<Lane>("all");
  const [sort, setSort] = useState<Sort>("new");
  const [view, setView] = useState<"list" | "grid">("list");

  const rows = useMemo(() => {
    const filtered = tokens.filter((token) => {
      const kind = laneOf(token);
      if (lane === "all") return true;
      if (lane === "near") return kind === "curve" && (token.progress || 0) >= 70 && (token.progress || 0) < 100;
      return kind === lane;
    });
    const copy = [...filtered];
    copy.sort((a, b) => {
      const pin = Number(tokenBoardKind(b) === "protocol") - Number(tokenBoardKind(a) === "protocol");
      if (pin && lane !== "listed" && lane !== "graduated") return pin;
      if (sort === "mcap") return (b.mcap ?? 0) - (a.mcap ?? 0);
      if (sort === "volume") return (volumeUsd(b) ?? 0) - (volumeUsd(a) ?? 0);
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
    return copy;
  }, [tokens, lane, sort]);

  if (tokens.length === 0) return null;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Pool stage">
          {LANES.map((item) => (
            <Button
              key={item.id}
              size="sm"
              role="tab"
              id={`lane-${item.id}`}
              aria-selected={lane === item.id}
              aria-controls="token-board-rows"
              tabIndex={lane === item.id ? 0 : -1}
              variant={lane === item.id ? "gold" : "ghost"}
              className="h-11 sm:h-9"
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const at = LANES.findIndex((l) => l.id === lane);
                const next = LANES[(at + (e.key === "ArrowRight" ? 1 : LANES.length - 1)) % LANES.length];
                setLane(next.id);
                document.getElementById(`lane-${next.id}`)?.focus();
              }}
              onClick={() => setLane(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:ml-auto" role="group" aria-label="Sort and view">
          {(["new", "mcap", "volume"] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              className="h-11 sm:h-9"
              aria-pressed={sort === item}
              variant={sort === item ? "secondary" : "ghost"}
              onClick={() => setSort(item)}
            >
              {item === "new" ? "Newest" : item === "mcap" ? "Market cap" : "Volume"}
            </Button>
          ))}
          <Button size="icon" variant={view === "list" ? "secondary" : "ghost"} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List />
          </Button>
          <Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
            <LayoutGrid />
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{NOTES[lane]}</p>
      <div id="token-board-rows" role="tabpanel" aria-labelledby={`lane-${lane}`}>
        {rows.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">Nothing in this filter yet.</p>
        ) : view === "grid" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((token) => (
              <TokenCard key={token.id} token={token} showDescription={false} />
            ))}
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((token) => (
              <li key={token.id}>
                <TokenRow token={token} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TokenRow({ token }: { token: EnrichedToken }) {
  const live = hasQuotedPool(token);
  const stage = curveStage(token);
  const protocol = tokenBoardKind(token) === "protocol";
  const body = (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 transition-colors hover:bg-muted/60 sm:grid-cols-[auto_minmax(0,1.4fr)_auto_auto_auto] sm:gap-4 sm:px-4">
      <TokenImage src={token.image_url} alt="" size={44} seed={token.id} protocol={protocol} className="size-11 sm:size-10" />
      <div className="min-w-0">
        <p className="truncate font-medium">
          {token.name} <span className="text-muted-foreground">${token.symbol}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChainMark chain={token.chain.key} className="size-3" />
          {age(token.created_at)}
          {live ? <span className="truncate">· {pairLabel(token.symbol, token.quote)}</span> : null}
        </p>
      </div>
      <dl className="text-right text-xs tabular-nums sm:hidden">
        <div className="flex items-baseline justify-end gap-1.5">
          <dt className="text-muted-foreground">MC</dt>
          <dd className="text-sm font-medium text-foreground">{mcapShort(token, live)}</dd>
        </div>
        <div className="mt-0.5 flex items-baseline justify-end gap-1.5">
          <dt className="text-muted-foreground">24h</dt>
          <dd>{volumeLabel(token, true)}</dd>
        </div>
      </dl>
      <p className="hidden text-right text-sm tabular-nums sm:block">
        <span className="block text-xs text-muted-foreground">Market cap</span>
        {live || token.dex ? formatMcap(token.mcap, token.priceUsd, token.quote.symbol) : "—"}
      </p>
      <p className="hidden text-right text-sm tabular-nums sm:block">
        <span className="block text-xs text-muted-foreground">24h vol</span>
        {volumeLabel(token)}
      </p>
      <div className="col-span-3 w-full sm:col-span-1 sm:w-36">
        <div className="flex justify-between gap-2 text-xs whitespace-nowrap text-muted-foreground">
          <span>{stage.label}</span>
          <span className="tabular-nums">{stage.value}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", stage.onCurve ? "bg-moss" : "bg-gold", stage.onCurve && stage.progress < 1 && "animate-pulse")}
            style={{ width: `${Math.max(stage.onCurve ? stage.progress : 100, 3)}%` }}
          />
        </div>
      </div>
    </div>
  );
  const className = "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (isZnzfRef(token.id) || isZnzfRef(token.contract_address)) {
    return (
      <Link to="/znzf" className={className}>
        {body}
      </Link>
    );
  }
  return (
    <Link to="/token/$id" params={{ id: tokenRouteId(token) }} className={className}>
      {body}
    </Link>
  );
}
