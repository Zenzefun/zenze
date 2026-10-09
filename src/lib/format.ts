export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function grouped(n: number, digits: number): string {
  return n.toLocaleString("en-US", {
    useGrouping: true,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUsd(n: number, digits = 2): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${grouped(n, 2)}`;
  if (abs >= 1) return `$${n.toFixed(digits)}`;
  if (abs >= 0.01) return `$${n.toFixed(3)}`;
  if (abs === 0) return "$0";
  return `$${n.toFixed(5)}`;
}

export function formatUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  const abs = Math.abs(n);
  const units = [
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
    { v: 1e3, s: "k" },
  ];
  for (const unit of units) {
    if (abs >= unit.v) {
      const text = (n / unit.v).toLocaleString("en-US", { maximumFractionDigits: 2 });
      return `$${text}${unit.s}`;
    }
  }
  return formatUsd(n);
}

export function formatUsdMaybe(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatUsd(n, digits);
}

export function formatUsdTiny(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "$0";
  if (abs >= 1) return formatUsd(n, 2);
  if (abs >= 0.01) return `$${n.toFixed(4)}`;
  if (abs >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(8)}`;
}

export function formatAmount(n: number, maxFrac = 8): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const digits = abs >= 1 ? Math.min(4, maxFrac) : abs >= 0.01 ? Math.min(6, maxFrac) : maxFrac;
  const raw = abs.toFixed(digits);
  return sign + raw.replace(/\.?0+$/, "");
}

/** Truncate toward zero. Used when the text is later parsed back into a token amount. */
export function floorDecimal(n: number, decimals: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const places = Math.min(18, Math.max(0, Math.floor(decimals)));
  const [whole, frac = ""] = Math.abs(n).toFixed(places + 4).split(".");
  const cut = frac.slice(0, places).replace(/0+$/, "");
  return cut ? `${whole}.${cut}` : whole;
}

/** Always show a fixed number of decimals, including zeros: 0 → "0.000000". */
export function formatFixed(n: number, digits = 6): string {
  const value = Number.isFinite(n) ? n : 0;
  const sign = value < 0 ? "-" : "";
  return sign + Math.abs(value).toFixed(digits);
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return grouped(n, Number.isInteger(n) ? 0 : 2);
  if (abs >= 10) return n.toFixed(2);
  if (abs >= 1) return n.toFixed(3);
  if (abs === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function formatEth(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 4 : abs >= 0.01 ? 5 : abs >= 0.0001 ? 6 : abs >= 1e-8 ? 10 : 12;
  const raw = abs.toFixed(digits);
  const trimmed = raw.replace(/\.?0+$/, "");
  if (trimmed.includes("e") || trimmed.includes("E")) {
    return sign + abs.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 12 });
  }
  return sign + trimmed;
}

export function formatNative(n: number, symbol: string): string {
  return `${formatEth(n)} ${symbol}`;
}

export function formatAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatMcap(mcap: number, priceUsd: number | null | undefined, quoteSymbol: string): string {
  if (!Number.isFinite(mcap)) return "—";
  if (priceUsd != null && Number.isFinite(priceUsd)) return formatUsd(mcap);
  return `${formatCompact(mcap)} ${quoteSymbol}`;
}

export function timeAgo(iso: string | Date): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
