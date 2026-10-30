import { Link } from "@tanstack/react-router";
import { TokenImage } from "@/components/media/smart-image";
import { tokenRouteId } from "@/lib/token-path";
import { cn } from "@/lib/utils";
import type { EnrichedToken } from "@/lib/server/market";

function ago(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Calm card grid of the newest launches, fed by the existing token list. */
export function FreshLaunchesFeed({ tokens, className, limit = 6 }: { tokens: EnrichedToken[]; className?: string; limit?: number }) {
  const fresh = [...tokens].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, limit);
  if (fresh.length === 0) return null;
  return (
    <section className={cn("mx-auto max-w-6xl px-4 py-6", className)} aria-labelledby="fresh-title">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="fresh-title" className="text-2xl font-semibold">Fresh launches 🌿</h2>
        <Link to="/explore" className="text-sm text-muted-foreground hover:text-foreground">See all</Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fresh.map((t) => (
          <li key={String(t.id)}>
            <Link
              to="/token/$id"
              params={{ id: tokenRouteId(t) }}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition duration-200 ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:border-moss/50 hover:shadow-[var(--shadow-lift)]"
            >
              <TokenImage src={t.image_url} alt="" size={44} seed={t.id} className="size-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t.name}</p>
                <p className="truncate text-sm text-muted-foreground">${t.symbol}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(t.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
