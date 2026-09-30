import { useId, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEth, formatPct, formatUsd, formatUsdTiny } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "5m", label: "5M", ms: 5 * 60_000 },
  { id: "1h", label: "1H", ms: 60 * 60_000 },
  { id: "6h", label: "6H", ms: 6 * 60 * 60_000 },
  { id: "1d", label: "1D", ms: 24 * 60 * 60_000 },
  { id: "all", label: "ALL", ms: 0 },
] as const;

type RangeId = (typeof RANGES)[number]["id"];

export function PriceChart({
  points,
  accent = "#7C9A5C",
  unit = "price",
  empty = "Chart opens with the first on-chain trade.",
  quoteUsd = null,
  currentPrice = 0,
  currentPriceUsd = null,
  currentMcap = null,
}: {
  points: { t: string; p: number }[];
  accent?: string;
  unit?: string;
  empty?: string;
  quoteUsd?: number | null;
  currentPrice?: number;
  currentPriceUsd?: number | null;
  currentMcap?: number | null;
}) {
  const [range, setRange] = useState<RangeId>("1h");
  const fillId = useId().replace(/:/g, "");
  const windowMs = RANGES.find((r) => r.id === range)?.ms ?? 0;

  const series = useMemo(() => {
    const raw = points
      .map((d) => ({ p: d.p, t: d.t, ts: new Date(d.t).getTime() }))
      .filter((d) => Number.isFinite(d.p) && d.p > 0 && Number.isFinite(d.ts));
    const now = Date.now();
    if (currentPrice > 0) {
      const last = raw[raw.length - 1];
      if (!last || now - last.ts > 15_000) {
        raw.push({ p: currentPrice, t: new Date(now).toISOString(), ts: now });
      }
    }
    if (range === "all" || windowMs <= 0) return raw;
    const cut = now - windowMs;
    const inWindow = raw.filter((d) => d.ts >= cut);
    if (inWindow.length > 0) {
      const before = [...raw].reverse().find((d) => d.ts < cut);
      if (before) return [{ ...before, ts: cut, t: new Date(cut).toISOString() }, ...inWindow];
      return inWindow;
    }
    if (raw.length === 0) return [];
    const last = raw[raw.length - 1];
    return [
      { ...last, ts: cut, t: new Date(cut).toISOString() },
      { ...last, ts: now, t: new Date(now).toISOString() },
    ];
  }, [points, range, windowMs, currentPrice]);

  const first = series[0]?.p ?? currentPrice;
  const last = series[series.length - 1]?.p ?? currentPrice;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;
  const stroke = up ? accent : "#E8A5A5";
  const lastUsd = quoteUsd != null && last > 0 ? last * quoteUsd : currentPriceUsd;
  const headline =
    currentMcap != null && currentPrice > 0 && last > 0
      ? formatUsd(currentMcap * (last / currentPrice))
      : lastUsd != null
        ? formatUsdTiny(lastUsd)
        : last > 0
          ? formatEth(last)
          : "—";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <p className="font-display text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{headline}</p>
          {series.length > 1 ? (
            <p className={cn("mt-1 text-sm font-medium tabular-nums", up ? "text-moss" : "text-destructive")}>
              {formatPct(change)} {range.toUpperCase()}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No trades in this window yet</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={cn(
                "h-8 min-w-10 rounded-full px-2.5 text-xs font-medium",
                range === r.id ? "bg-primary text-primary-foreground" : "border border-border bg-card hover:bg-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {series.length === 0 ? (
        <div className="grid h-56 place-items-center px-4 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--color-foreground)",
                }}
                formatter={(value) => {
                  const n = Number(value);
                  if (quoteUsd != null) return [formatUsdTiny(n * quoteUsd), "USD"];
                  return [formatEth(n), unit];
                }}
                labelFormatter={(_, payload) => {
                  const t = payload?.[0]?.payload?.t as string | undefined;
                  return t ? new Date(t).toLocaleString() : "";
                }}
              />
              <Area type="monotone" dataKey="p" stroke={stroke} strokeWidth={2} fill={`url(#${fillId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
