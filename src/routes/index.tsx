import { pageHead } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SmartImage } from "@/components/media/smart-image";
import { AppShell } from "@/components/layout/app-shell";
import { TokenBoard } from "@/components/tokens/token-board";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listTokens, protocolStats } from "@/lib/server/market";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [stats, tokens] = await Promise.all([protocolStats(), listTokens().catch(() => [])]);
    return { stats, tokens };
  },
  component: Home,
  head: () =>
    pageHead({
      description:
        "Name a token on Robinhood Chain or Arc, then buy and sell it in the same pool. The rules are in the docs.",
      path: "/",
    }),
});

function Home() {
  const initial = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats(), initialData: initial.stats, refetchInterval: 15_000 });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens(), initialData: initial.tokens, refetchInterval: 15_000 });
  const board = tokens.data ?? [];

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <section className="mx-auto max-w-6xl px-4 py-8">
        {tokens.isPending && <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>}
        <TokenBoard tokens={board} />
        {!tokens.isPending && board.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center">
            <SmartImage src="/brand/capy-sleep.webp" alt="" width={160} height={160} className="mx-auto w-40 rounded-xl" rounded="xl" />
            <p className="mt-4 text-muted-foreground">No tokens yet.</p>
            <Button asChild className="mt-4" variant="gold">
              <Link to="/launch">Launch a token</Link>
            </Button>
          </div>
        )}
      </section>
    </AppShell>
  );
}
