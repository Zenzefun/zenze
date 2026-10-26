import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChainMark } from "@/components/chains/chain-mark";
import { AppShell } from "@/components/layout/app-shell";
import { TokenBoard } from "@/components/tokens/token-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TokenListSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/site/empty-state";
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
        <h1 className="max-w-[680px] text-3xl font-semibold sm:text-4xl">Explore</h1>
        <p className="mt-2 max-w-[680px] text-pretty text-muted-foreground">Every pool on Zenzen. Search by name or ticker, then narrow it to one chain.</p>
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
              <Button key={f.id} size="sm" className="h-11 sm:h-9" aria-pressed={chain === f.id} variant={chain === f.id ? "gold" : "outline"} onClick={() => setChain(f.id)}>
                {f.id !== "all" && <ChainMark chain={f.id} className="size-3.5" />}
                {f.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-8">
          {tokens.isPending && <TokenListSkeleton rows={6} />}
          <TokenBoard tokens={list} showDescription={false} />
        </div>
        {tokens.isError && <QueryError onRetry={() => void tokens.refetch()} />}
        {!tokens.isPending && !tokens.isError && list.length === 0 && (
          <EmptyState
            title={(tokens.data ?? []).length === 0 ? "No tokens yet" : "No tokens match"}
            body={
              (tokens.data ?? []).length === 0
                ? "Be the first to open a pool. Name a token and it can trade the moment it launches."
                : "Nothing matches that name, ticker, or chain. Clear the filters, or launch a token."
            }
            actions={
              <>
                <HomeButton variant="outline" />
                <Button asChild variant="gold">
                  <Link to="/launch">Launch a token</Link>
                </Button>
              </>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
