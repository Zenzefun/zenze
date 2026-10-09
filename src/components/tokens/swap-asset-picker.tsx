import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, forwardRef } from "react";
import { QuoteMark } from "@/components/chains/quote-mark";
import { TokenImage } from "@/components/media/smart-image";
import { Input } from "@/components/ui/input";
import type { ChainKey } from "@/lib/chains";
import { PAIR_ASSETS, quotesFor } from "@/lib/pairs";
import { assetFromQuote, type SwapAsset } from "@/lib/swap-route";
import { isZnzfAsset } from "@/lib/swap-legs";
import { cn } from "@/lib/utils";

const PAIR_ORDER = new Map(PAIR_ASSETS.map((p, i) => [p.symbol.toUpperCase(), i]));
const PAIR_SYMS = new Set(PAIR_ASSETS.map((p) => p.symbol.toUpperCase()));

function isQuotePair(asset: SwapAsset) {
  return asset.kind === "quote" || PAIR_SYMS.has(asset.symbol.toUpperCase());
}

function Mark({ asset, className }: { asset: SwapAsset; className?: string }) {
  if (isQuotePair(asset)) {
    return <QuoteMark quote={asset.symbol.toLowerCase()} className={className} />;
  }
  return (
    <TokenImage src={asset.image} size={24} seed={asset.tokenId || asset.symbol} className={cn("size-6", className)} />
  );
}

const Chip = forwardRef<HTMLButtonElement, { asset: SwapAsset; open?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Chip({ asset, open, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-swap-chip={asset.symbol}
        {...props}
        className={cn(
          "inline-flex min-h-11 max-w-[10.5rem] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 hover:bg-muted",
          className,
        )}
      >
        <Mark asset={asset} />
        <span className="truncate text-sm font-semibold">{asset.symbol}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
    );
  },
);

export const SwapAssetButton = Chip;

export function SwapAssetPicker({
  assets,
  value,
  onChange,
  chain,
  znzfAddress,
  locked = false,
}: {
  assets: SwapAsset[];
  value: SwapAsset;
  other?: SwapAsset | null;
  onChange: (asset: SwapAsset) => void;
  chain: ChainKey;
  znzfAddress?: string | null;
  locked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const quotes = useMemo(() => {
    const bySym = new Map<string, SwapAsset>();
    for (const a of assets) {
      if (!isQuotePair(a)) continue;
      const k = a.symbol.toUpperCase();
      if (!bySym.has(k)) bySym.set(k, a);
    }
    const dexReady = assets.some((a) => a.kind === "quote" && a.venue === "dex");
    const out: SwapAsset[] = [];
    const seen = new Set<string>();
    for (const p of quotesFor(chain)) {
      if (p.key === "znzf") continue;
      const hit = bySym.get(p.symbol.toUpperCase()) ?? assetFromQuote(p, chain, znzfAddress);
      if (!hit || seen.has(hit.graphId) || isZnzfAsset(hit)) continue;
      if (dexReady && !hit.native && hit.venue !== "dex") continue;
      seen.add(hit.graphId);
      out.push(hit);
    }
    out.sort(
      (a, b) => (PAIR_ORDER.get(a.symbol.toUpperCase()) ?? 999) - (PAIR_ORDER.get(b.symbol.toUpperCase()) ?? 999),
    );
    return out;
  }, [assets, chain, znzfAddress]);

  const tradable = useMemo(() => {
    const quoteIds = new Set(quotes.map((a) => a.graphId));
    const seen = new Set<string>();
    const launched: SwapAsset[] = [];
    const listed: SwapAsset[] = [];
    for (const a of assets) {
      if (a.kind !== "token" || quoteIds.has(a.graphId) || seen.has(a.graphId) || isZnzfAsset(a)) continue;
      if (a.venue === "dex") {
        seen.add(a.graphId);
        listed.push(a);
        continue;
      }
      if (!a.curveAddress) continue;
      seen.add(a.graphId);
      launched.push(a);
    }
    return { launched, listed };
  }, [assets, quotes]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const needle = s === "usdc" || s === "usd" ? "usdg" : s;
    const match = (a: SwapAsset) =>
      !needle ||
      a.symbol.toLowerCase().includes(needle) ||
      a.name.toLowerCase().includes(needle) ||
      (a.tokenId ?? "").toLowerCase().includes(needle) ||
      a.quoteSymbol.toLowerCase().includes(needle);
    return { pairs: quotes.filter(match), launched: tradable.launched.filter(match), listed: tradable.listed.filter(match) };
  }, [quotes, tradable, q]);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setDropUp(window.innerHeight - r.bottom < 220 && r.top > 220);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQ("");
      }
    }
    function onDown(e: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  function pick(asset: SwapAsset) {
    onChange(asset);
    setQ("");
    setOpen(false);
  }

  if (locked) {
    return (
      <span
        data-swap-chip={value.symbol}
        data-locked="true"
        className="inline-flex min-h-11 max-w-[10.5rem] items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5"
      >
        <Mark asset={value} />
        <span className="truncate text-sm font-semibold">{value.symbol}</span>
      </span>
    );
  }

  return (
    <div className="relative z-20 inline-flex" ref={rootRef}>
      <Chip asset={value} open={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div
          role="listbox"
          aria-label="Quote pairs"
          data-swap-pair-picker
          className={cn(
            "absolute right-0 z-50 w-[min(11.5rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_18px_40px_-24px_color-mix(in_oklab,var(--color-stone)_45%,transparent)]",
            dropUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
          )}
        >
          <div className="p-1.5">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ETH, USDG, NVDA…"
              aria-label="Search quote pairs"
              autoFocus
              className="h-8"
            />
          </div>
          <div className="max-h-44 overflow-y-auto p-1">
            {filtered.pairs.length > 0 && (
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quote pairs
              </p>
            )}
            {filtered.pairs.map((a) => (
              <Row key={a.graphId} asset={a} active={a.graphId === value.graphId} onPick={pick} />
            ))}
            {filtered.launched.length > 0 && (
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Live curves
              </p>
            )}
            {filtered.launched.map((a) => (
              <Row key={a.graphId} asset={a} active={a.graphId === value.graphId} onPick={pick} />
            ))}
            {filtered.listed.length > 0 && (
              <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Listed
              </p>
            )}
            {filtered.listed.map((a) => (
              <Row key={a.graphId} asset={a} active={a.graphId === value.graphId} onPick={pick} />
            ))}
            {filtered.pairs.length === 0 && filtered.launched.length === 0 && filtered.listed.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No pair matches that ticker.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  asset,
  active,
  onPick,
}: {
  asset: SwapAsset;
  active: boolean;
  onPick: (a: SwapAsset) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPick(asset);
      }}
      className={cn(
        "flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:bg-muted",
        active && "bg-muted",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Mark asset={asset} className="size-5" />
        <span className="truncate font-medium">{asset.symbol}</span>
      </span>
      {active && <Check className="size-3.5 shrink-0 text-moss" />}
    </button>
  );
}
