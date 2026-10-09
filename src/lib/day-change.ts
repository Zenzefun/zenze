/** A human comparison. A huge percent from a tiny yesterday is not a useful number. */
export function dayChange(current: number, prior: number, priorText?: string): string {
  if (!(current > 0) && !(prior > 0)) return "";
  if (!(prior > 0)) return "None yesterday";
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) >= 300) {
    const from = priorText ?? String(prior);
    return current >= prior ? `Up from ${from} yesterday` : `Down from ${from} yesterday`;
  }
  if (Math.abs(pct) < 0.5) return "Flat vs yesterday";
  const direction = pct > 0 ? "Up" : "Down";
  return `${direction} ${Math.abs(pct).toFixed(0)}% vs yesterday`;
}
