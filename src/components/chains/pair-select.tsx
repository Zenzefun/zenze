import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { QuoteMark } from "./quote-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ChainKey } from "@/lib/chains";
import { defaultQuote, pairLabel, quoteOf, quotesFor, type QuoteAsset, type QuoteKey } from "@/lib/pairs";
import { liveQuotes } from "@/lib/server/market";
import { cn } from "@/lib/utils";

export function PairSelect({
  chain,
  value,
  onChange,
  symbol = "TOKEN",
  znzfLive = true,
  className,
}: {
  chain: ChainKey;
  value: QuoteKey;
  onChange: (key: QuoteKey) => void;
  symbol?: string;
  znzfLive?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const live = useQuery({
    queryKey: ["live-quotes", chain],
    queryFn: () => liveQuotes({ data: { chain } }),
    staleTime: 10 * 60_000,
  });
  const current = quoteOf(value, chain);
  const catalog = quotesFor(chain);
  const all = useMemo(() => {
    const keys = live.data;
    if (!keys) return catalog.filter((p) => p.native || p.kind === "stable" || (p.key === "znzf" && znzfLive));
    return catalog.filter((p) => keys.includes(p.key));
  }, [catalog, live.data, znzfLive]);

  useEffect(() => {
    if (live.isPending) return;
    if (!all.some((p) => p.key === value)) onChange(defaultQuote(chain));
  }, [all, chain, live.isPending, onChange, value]);

  const ticker = (symbol || "TOKEN").replace(/^\$+/, "").toUpperCase();
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (p) =>
        p.symbol.toLowerCase().includes(s) ||
        p.name.toLowerCase().includes(s) ||
        p.key.includes(s) ||
        p.pair.toLowerCase().includes(s) ||
        pairLabel(ticker, p).toLowerCase().includes(s),
    );
  }, [all, q, ticker]);

  function pick(key: QuoteKey) {
    if (key === "znzf" && !znzfLive) return;
    onChange(key);
    setQ("");
    setOpen(false);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 text-left text-sm hover:bg-muted",
            className,
          )}
          aria-label={pairLabel(ticker, current)}
        >
          <QuoteMark quote={current.key} className="size-7" />
          <span className="min-w-0 flex-1 truncate font-medium whitespace-nowrap">{pairLabel(ticker, current)}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0 p-0" align="start" sideOffset={8}>
        <div className="p-1.5" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ETH, USDG, NVDA…"
            aria-label="Search trading pairs"
            className="h-8"
          />
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">No live pair matches that ticker.</p>
          )}
          {filtered.map((asset) => {
            const on = value === asset.key;
            const locked = asset.key === "znzf" && !znzfLive;
            const label = pairLabel(ticker, asset);
            return (
              <DropdownMenuItem
                key={asset.key}
                disabled={locked}
                onSelect={(e) => {
                  e.preventDefault();
                  pick(asset.key);
                }}
              >
                <QuoteMark quote={asset.key} className="size-6" />
                <span className="min-w-0 flex-1 truncate font-medium whitespace-nowrap">{label}</span>
                {on && <Check className="size-4 text-moss" />}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PairBadge({ symbol, quote }: { symbol: string; quote: QuoteAsset | QuoteKey }) {
  const key = typeof quote === "string" ? quote : quote.key;
  const label = pairLabel(symbol, quote);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <QuoteMark quote={key} className="size-3.5" />
      {label}
    </span>
  );
}
