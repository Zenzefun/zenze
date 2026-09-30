import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChainMark } from "@/components/chains/chain-mark";
import { AppShell } from "@/components/layout/app-shell";
import { SmartImage } from "@/components/media/smart-image";
import { ShareX } from "@/components/share/share-x";
import { TokenCard } from "@/components/tokens/token-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChainKey } from "@/lib/chains";
import { protocolStats, listTokens } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { tweetForPath } from "@/lib/og-copy";
import { QueryError } from "@/components/site/query-error";
import { HomeButton } from "@/components/site/home-button";

export const Route = createFileRoute("/explore")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: Explore,
  head: ({ search }) =>
    pageHead({
      title: "Explore",
      description: "Newest pools first. On a new pool, buying earlier means you pay less than the next buyer.",
      path: "/explore",
      index: !search.q,
    }),
});

const FILTERS: { id: "all" | ChainKey; label: string }[] = [
  { id: "all", label: "All rivers" },
  { id: "robinhood", label: "Robinhood" },
  { id: "arc", label: "Arc" },
];

function Explore() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens() });
  const { q: qParam } = Route.useSearch();
  const [q, setQ] = useState(qParam ?? "");
  const [chain, setChain] = useState<"all" | ChainKey>("all");
  const [sort, setSort] = useState<"new" | "mcap" | "health">("new");

  const list = useMemo(() => {
    let rows = tokens.data ?? [];
    if (chain !== "all") rows = rows.filter((t) => t.chain.key === chain);
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((t) => `${t.name}${t.symbol}${t.description}`.toLowerCase().includes(s));
    const copy = [...rows];
    if (sort === "mcap") copy.sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0));
    else if (sort === "health") copy.sort((a, b) => b.health_score - a.health_score);
    else copy.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    copy.sort((a, b) => Number(b.id === "znzf") - Number(a.id === "znzf"));
    return copy;
  }, [tokens.data, chain, q, sort]);

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Explore</h1>
        <p className="mt-2 text-muted-foreground">Newest first. On a new pool, buying earlier means you pay less than the next buyer.</p>
        <div className="mt-3">
          <ShareX text={tweetForPath("/explore")} path="/explore" />
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or ticker"
            className="sm:max-w-xs"
            aria-label="Search tokens"
          />
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button key={f.id} size="sm" variant={chain === f.id ? "gold" : "outline"} onClick={() => setChain(f.id)}>
                {f.id !== "all" && <ChainMark chain={f.id} className="size-3.5" />}
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            {(["new", "mcap", "health"] as const).map((s) => (
              <Button key={s} size="sm" variant={sort === s ? "secondary" : "ghost"} onClick={() => setSort(s)}>
                {s === "new" ? "New" : s === "mcap" ? "Mcap" : "Health"}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.isPending && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          {list.map((t) => (
            <TokenCard key={t.id} token={t} />
          ))}
        </div>
        {tokens.isError && <QueryError onRetry={() => void tokens.refetch()} />}
        {!tokens.isPending && !tokens.isError && list.length === 0 && (
          <div className="mx-auto mt-12 max-w-sm text-center">
            <SmartImage src="/brand/capy-sleep.webp" alt="" width={160} height={160} className="mx-auto w-40 rounded-xl" rounded="xl" />
            <p className="mt-4 text-muted-foreground">The pool is still. Launch the first token.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <HomeButton />
              <Button asChild variant="gold">
                <Link to="/launch">Launch a token</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
