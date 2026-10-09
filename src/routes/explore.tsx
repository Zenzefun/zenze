import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChainMark } from "@/components/chains/chain-mark";
import { AppShell } from "@/components/layout/app-shell";
import { SmartImage } from "@/components/media/smart-image";
import { TokenBoard } from "@/components/tokens/token-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChainKey } from "@/lib/chains";
import { protocolStats, listTokens } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { QueryError } from "@/components/site/query-error";
import { HomeButton } from "@/components/site/home-button";

export const Route = createFileRoute("/explore")({
  validateSearch: (search: Record<string, unknown> | undefined): { q?: string } => ({
    q: typeof search?.q === "string" ? search.q : undefined,
  }),
  loader: async () => {
    const [stats, tokens] = await Promise.all([protocolStats(), listTokens().catch(() => [])]);
    return { stats, tokens };
  },
  component: Explore,
  head: (ctx) =>
    pageHead({
      title: "Explore",
      description: "Newest pools first.",
      path: "/explore",
      index: !(ctx.search?.q ?? ctx.match?.search?.q),
    }),
});

const FILTERS: { id: "all" | ChainKey; label: string }[] = [
  { id: "all", label: "All chains" },
  { id: "robinhood", label: "Robinhood" },
  { id: "arc", label: "Arc" },
];

function Explore() {
  const initial = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats(), initialData: initial.stats });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens(), initialData: initial.tokens });
  const { q: qParam } = Route.useSearch();
  const [q, setQ] = useState(qParam ?? "");
  const [chain, setChain] = useState<"all" | ChainKey>("all");

  const list = useMemo(() => {
    let rows = tokens.data ?? [];
    if (chain !== "all") rows = rows.filter((t) => t.chain.key === chain);
    const s = q.trim().toLowerCase();
    if (s) rows = rows.filter((t) => `${t.name}${t.symbol}${t.description}`.toLowerCase().includes(s));
    return rows;
  }, [tokens.data, chain, q]);

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Explore</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">Same board as the front page. Search, then filter by chain.</p>
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
        </div>
        <div className="mt-8">
          {tokens.isPending && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}</div>}
          <TokenBoard tokens={list} showDescription={false} />
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
