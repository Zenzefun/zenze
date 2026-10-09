import { useEffect, useMemo, useRef, useState } from "react";
import { chartWindow } from "@/lib/chart-window";
import { formatEth, formatPct, formatUsd, formatUsdTiny } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "5m", label: "5M", ms: 5 * 60_000 },
  { id: "1h", label: "1H", ms: 60 * 60_000 },
  { id: "6h", label: "6H", ms: 6 * 60 * 60_000 },
  { id: "1d", label: "1D", ms: 24 * 60 * 60_000 },
  { id: "all", label: "ALL", ms: 0 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

type Point = { t: string; p: number; side?: "buy" | "sell"; size?: number };

function cssColor(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function withAlpha(color: string, alpha: number) {
  const hex = color.trim();
  if (!hex.startsWith("#") || hex.length < 7) return color;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function PriceChart({
  points,
  empty = "Chart opens with the first on-chain trade.",
  quoteUsd = null,
  currentPrice = 0,
  currentMcap = null,
}: {
  points: Point[];
  accent?: string;
  unit?: string;
  empty?: string;
  quoteUsd?: number | null;
  currentPrice?: number;
  currentPriceUsd?: number | null;
  currentMcap?: number | null;
}) {
  const [range, setRange] = useState<RangeId>("1h");
  const [mode, setMode] = useState<"mcap" | "price">(currentMcap != null && currentPrice > 0 ? "mcap" : "price");
  const [hover, setHover] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ remove: () => void; applyOptions: (opts: object) => void; timeScale: () => { fitContent: () => void } } | null>(null);
  const areaRef = useRef<{ setData: (rows: { time: number; value: number }[]) => void; applyOptions: (opts: object) => void } | null>(null);
  const moneyRef = useRef<(value: number) => string>(() => "—");
  const [ready, setReady] = useState(0);
  const spec = RANGES.find((item) => item.id === range) ?? RANGES[1];
  const canMcap = currentMcap != null && currentMcap > 0 && currentPrice > 0;
  const view = mode === "mcap" && canMcap ? "mcap" : "price";

  const rows = useMemo(() => chartWindow(points, spec.ms, Date.now(), currentPrice), [points, spec.ms, currentPrice]);

  const scale = (price: number) =>
    view === "mcap" && canMcap ? currentMcap! * (price / currentPrice) : quoteUsd != null && quoteUsd > 0 ? price * quoteUsd : price;
  const series = useMemo(
    () => rows.map((row) => ({ ...row, v: scale(row.p) })),
    [rows, view, canMcap, currentMcap, currentPrice, quoteUsd],
  );
  const shown = hover ?? series[series.length - 1]?.v ?? 0;
  const first = series[0]?.v ?? 0;
  const change = first > 0 ? ((shown - first) / first) * 100 : 0;
  const up = change >= 0;

  function money(value: number) {
    if (!(value > 0)) return "—";
    if (view === "mcap" || quoteUsd != null) {
      const abs = Math.abs(value);
      if (abs >= 1_000_000) return `$${(value / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
      if (abs >= 1_000) return `$${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: abs >= 10_000 ? 1 : 2 })}K`;
      return view === "mcap" ? formatUsd(value) : formatUsdTiny(value);
    }
    return formatEth(value);
  }

  const data = useMemo(() => {
    const bySecond = new Map<number, number>();
    for (const row of series) bySecond.set(Math.floor(row.ts / 1000), row.v);
    return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
  }, [series]);

  const heat = useMemo(() => {
    const buckets = 28;
    const end = Date.now();
    const start = spec.ms > 0 ? end - spec.ms : series[0]?.ts ?? end - 60_000;
    const span = Math.max(1, end - start);
    const cells = Array.from({ length: buckets }, () => ({ buy: 0, sell: 0 }));
    for (const row of series) {
      const index = Math.min(buckets - 1, Math.max(0, Math.floor(((row.ts - start) / span) * buckets)));
      const size = row.size && row.size > 0 ? row.size : 1;
      if (row.side === "sell") cells[index].sell += size;
      else if (row.side === "buy") cells[index].buy += size;
    }
    const peak = Math.max(1, ...cells.map((cell) => cell.buy + cell.sell));
    return cells.map((cell) => {
      const total = cell.buy + cell.sell;
      const net = cell.buy - cell.sell;
      return { total, net, strength: total / peak };
    });
  }, [series, spec.ms]);

  moneyRef.current = money;

  const show = series.length > 0;

  useEffect(() => {
    const node = box.current;
    if (!show || !node) return;
    let dead = false;
    let chart: { remove: () => void } | null = null;
    void import("lightweight-charts")
      .then(({ createChart, AreaSeries, ColorType }) => {
        if (dead || !node.isConnected) return;
        node.replaceChildren();
        const text = cssColor("--color-muted-foreground", "#6b5a48");
        const border = cssColor("--color-border", "#d9c9a3");
        const line = cssColor("--color-moss", "#7c9a5c");
        const next = createChart(node, {
          autoSize: true,
          layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontFamily: "inherit" },
          grid: { vertLines: { visible: false }, horzLines: { color: border } },
          rightPriceScale: { borderVisible: false },
          leftPriceScale: { visible: false },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
          crosshair: {
            vertLine: { color: text, labelBackgroundColor: line },
            horzLine: { color: text, labelBackgroundColor: line },
          },
          handleScroll: false,
          handleScale: false,
        });
        const area = next.addSeries(AreaSeries, {
          lineColor: line,
          topColor: withAlpha(line, 0.35),
          bottomColor: withAlpha(line, 0.02),
          lineWidth: 2,
          priceLineVisible: true,
          lastValueVisible: true,
          priceFormat: { type: "custom", minMove: 0.00000001, formatter: (value: number) => moneyRef.current(value) },
        });
        next.subscribeCrosshairMove((param) => {
          const hit = param.seriesData?.get(area) as { value?: number } | undefined;
          setHover(typeof hit?.value === "number" ? hit.value : null);
        });
        chart = next;
        chartRef.current = next;
        areaRef.current = area;
        setReady((n) => n + 1);
        setDrawn(true);
      })
      .catch(() => setDrawn(false));
    return () => {
      dead = true;
      chart?.remove();
      chartRef.current = null;
      areaRef.current = null;
      node.replaceChildren();
    };
  }, [show, range, view]);

  useEffect(() => {
    const area = areaRef.current;
    const chart = chartRef.current;
    if (!area || !chart || data.length < 1) return;
    const line = up ? cssColor("--color-moss", "#7c9a5c") : cssColor("--color-destructive", "#b85c5c");
    const text = cssColor("--color-muted-foreground", "#6b5a48");
    area.applyOptions({
      lineColor: line,
      topColor: withAlpha(line, 0.35),
      bottomColor: withAlpha(line, 0.02),
      priceFormat: { type: "custom", minMove: 0.00000001, formatter: (value: number) => moneyRef.current(value) },
    });
    area.setData(data);
    chart.applyOptions({
      timeScale: { timeVisible: true, secondsVisible: range === "5m", fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        vertLine: { color: text, labelBackgroundColor: line },
        horzLine: { color: text, labelBackgroundColor: line },
      },
    });
    chart.timeScale().fitContent();
  }, [data, range, view, ready]);

  return (
    <div>
      <div>
        <p className="text-xs text-muted-foreground">{view === "mcap" ? "Market cap" : "Price"}</p>
        <p className="font-display text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{money(shown)}</p>
        {series.length > 1 ? (
          <p className={cn("mt-1 text-sm font-medium tabular-nums", up ? "text-moss" : "text-destructive")}>{formatPct(change)} {spec.label}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No price yet</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canMcap ? (
          <div className="inline-flex gap-1.5" role="group" aria-label="Chart value">
            <Button type="button" size="sm" variant={view === "mcap" ? "default" : "outline"} aria-pressed={view === "mcap"} onClick={() => setMode("mcap")}>
              Market cap
            </Button>
            <Button type="button" size="sm" variant={view === "price" ? "default" : "outline"} aria-pressed={view === "price"} onClick={() => setMode("price")}>
              Price
            </Button>
          </div>
        ) : null}
        <div className="inline-flex gap-1.5" role="group" aria-label="Chart range">
          {RANGES.map((item) => (
            <Button key={item.id} type="button" size="sm" variant={range === item.id ? "default" : "outline"} aria-pressed={range === item.id} onClick={() => setRange(item.id)}>
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      {show ? (
        <div ref={box} className="relative mt-3 h-72 w-full overflow-hidden sm:h-80" />
      ) : (
        <div className="mt-3 grid h-72 place-items-center rounded-2xl bg-muted/40 px-4 text-center text-sm text-muted-foreground">{empty}</div>
      )}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Heatmap</span>
          <span style={{ display: "inline-flex", gap: 12 }}>
            <span>Buy</span>
            <span>Sell</span>
          </span>
        </div>
        <div className="grid h-8 grid-flow-col gap-0.5" style={{ display: "grid", gridAutoFlow: "column", gap: 2, height: 32 }} aria-label="Trade heatmap">
          {heat.map((cell, index) => (
            <div
              key={index}
              className={cn("rounded-sm", cell.total === 0 ? "bg-muted" : cell.net >= 0 ? "bg-moss" : "bg-destructive")}
              style={{ opacity: cell.total === 0 ? 0.45 : 0.28 + cell.strength * 0.72 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
