import { tokenBoardKind } from "@/lib/pool";
import { isZnzfRef } from "@/lib/token-path";
import type { EnrichedToken } from "@/lib/server/market";

export type CurveStage = { onCurve: boolean; progress: number; label: string; value: string };

/** Curve stage label. 0% is a fresh pool, not a dead one, and the protocol pool says so. */
export function curveStage(token: EnrichedToken): CurveStage {
  const kind = tokenBoardKind(token);
  const onCurve = kind === "curve" || kind === "protocol";
  const progress = onCurve ? Math.max(0, Math.min(100, token.progress || 0)) : 100;
  if (!onCurve) return { onCurve, progress, label: kind === "graduated" ? "Graduated" : "Listed", value: "Uniswap" };
  if (kind === "protocol") return { onCurve, progress, label: "Protocol pool", value: "Live" };
  if (progress < 1) return { onCurve, progress, label: "Curve", value: "Just opened" };
  return { onCurve, progress, label: progress >= 70 ? "About to graduate" : "Curve", value: `${progress.toFixed(0)}%` };
}

/** The curve token closest to graduating (protocol pool excluded). Ties go to the newer pool. */
export function pickAboutToGraduate(tokens: EnrichedToken[]): EnrichedToken | null {
  const curve = tokens.filter((t) => tokenBoardKind(t) === "curve" && !isZnzfRef(t.id) && (t.progress ?? 0) < 100);
  if (curve.length === 0) return null;
  return [...curve].sort(
    (a, b) => (b.progress ?? 0) - (a.progress ?? 0) || +new Date(b.created_at) - +new Date(a.created_at),
  )[0];
}
