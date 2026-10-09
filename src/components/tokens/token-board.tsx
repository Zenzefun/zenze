import { LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChainMark } from "@/components/chains/chain-mark";
import { TokenImage } from "@/components/media/smart-image";
import { TokenCard } from "@/components/tokens/token-card";
import { Button } from "@/components/ui/button";
import { asNumber, formatCompact, formatMcap, formatUsdMaybe } from "@/lib/format";
import { pairLabel } from "@/lib/pairs";
import { hasQuotedPool, tokenBoardKind } from "@/lib/pool";
import { isZnzfRef, tokenRouteId } from "@/lib/token-path";
import { cn } from "@/lib/utils";
import type { EnrichedToken } from "@/lib/server/market";

type Lane = "all" | "curve" | "near" | "graduated" | "listed";
type Sort = "new" | "mcap" | "volume";

const LANES: { id: Lane; label: string }[] = [
  { id: "all", label: "All" },
  { id: "curve", label: "On the curve" },
  { id: "near", label: "Near full" },
  { id: "graduated", label: "Graduated" },
  { id: "listed", label: "Listed" },
];

const NOTES: Record<Lane, string> = {
  all: "Newest first. Curve, graduated, and listed stay marked so they do not look like the same thing.",
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

function volumeUsd(token: EnrichedToken) {
  const native = asNumber(token.volume_24h);
  if (token.quote.key === "eth") return token.ethUsd != null ? native * token.ethUsd : null;
  return native;
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
              variant={lane === item.id ? "gold" : "ghost"}
              aria-pressed={lane === item.id}
              onClick={() => setLane(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:ml-auto">
          {(["new", "mcap", "volume"] as const).map((item) => (
            <Button key={item} size="sm" variant={sort === item ? "secondary" : "ghost"} onClick={() => setSort(item)}>
              {item === "new" ? "Newest" : item === "mcap" ? "Market cap" : "Volume"}
            </Button>
          ))}
          <Button size="icon" variant={view === "list" ? "secondary" : "ghost"} aria-label="List" onClick={() => setView("list")}>
            <List />
          </Button>
          <Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} aria-label="Grid" onClick={() => setView("grid")}>
            <LayoutGrid />
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{NOTES[lane]}</p>
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
  );
}

function TokenRow({ token }: { token: EnrichedToken }) {
  const kind = laneOf(token);
  const onCurve = kind === "curve";
  const live = hasQuotedPool(token);
  const progress = onCurve ? Math.max(0, Math.min(100, token.progress || 0)) : 100;
  const vol = volumeUsd(token);
  const body = (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/60 sm:grid-cols-[auto_minmax(0,1.4fr)_auto_auto_auto] sm:gap-4 sm:px-4">
      <TokenImage src={token.image_url} alt="" size={40} seed={token.id} protocol={tokenBoardKind(token) === "protocol"} className="size-10" />
      <div className="min-w-0">
        <p className="truncate font-medium">
          {token.name} <span className="text-muted-foreground">${token.symbol}</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChainMark chain={token.chain.key} className="size-3" />
          {age(token.created_at)}
          {live ? <span>· {pairLabel(token.symbol, token.quote)}</span> : null}
        </p>
      </div>
      <p className="hidden text-right text-sm tabular-nums sm:block">
        <span className="block text-[11px] text-muted-foreground">Market cap</span>
        {live || token.dex ? formatMcap(token.mcap, token.priceUsd, token.quote.symbol) : "—"}
      </p>
      <p className="hidden text-right text-sm tabular-nums md:block">
        <span className="block text-[11px] text-muted-foreground">24h</span>
        {vol != null ? formatUsdMaybe(vol) : formatCompact(asNumber(token.volume_24h))}
      </p>
      <div className="col-span-2 w-full sm:col-span-1 sm:w-28">
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{onCurve ? "Curve" : kind === "graduated" ? "Graduated" : "Listed"}</span>
          <span className="tabular-nums">{onCurve ? `${progress.toFixed(0)}%` : "Uniswap"}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", onCurve ? "bg-moss" : "bg-gold")} style={{ width: `${Math.max(onCurve ? progress : 100, 2)}%` }} />
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
