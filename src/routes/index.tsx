import { pageHead } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SmartImage } from "@/components/media/smart-image";
import { AppShell } from "@/components/layout/app-shell";
import { RecentLaunches, TokenBoard } from "@/components/tokens/token-board";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeaturedToken } from "@/components/home/featured-token";
import { HomeHero } from "@/components/home/home-hero";
import { TradeTicker } from "@/components/home/trade-ticker";
import { TrustStrip } from "@/components/site/trust-strip";
import { pickAboutToGraduate, pickNewestCurve } from "@/lib/token-stage";
import { listTokens, protocolStats } from "@/lib/server/market";
import { creatorQuestFeatured } from "@/lib/server/airdrop";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [stats, tokens, questIds] = await Promise.all([
      protocolStats(),
      listTokens().catch(() => []),
      creatorQuestFeatured().catch(() => [] as string[]),
    ]);
    return { stats, tokens, questIds };
  },
  component: Home,
  head: () =>
    pageHead({
      description:
        "Launch a token on Robinhood Chain or Arc. Its pool opens at launch, anyone can buy it or sell it back, and it graduates to Uniswap when the curve fills.",
      path: "/",
    }),
});

function Home() {
  const initial = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats(), initialData: initial.stats, refetchInterval: 15_000 });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens(), initialData: initial.tokens, refetchInterval: 15_000 });
  const board = tokens.data ?? [];
  // Featured slot: a Creator Quest finisher first, then the pool closest to graduating, then the newest.
  const questToken = (initial.questIds ?? []).map((id) => board.find((t: { id: unknown }) => String(t.id) === id)).find(Boolean) ?? null;
  const graduating = questToken ? null : pickAboutToGraduate(board);
  const featured = questToken ?? graduating ?? pickNewestCurve(board);
  const featuredReason = questToken ? "quest" : graduating ? "graduating" : "new";

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-2 sm:pt-10">
        <HomeHero stats={stats.data} tokens={board} />
        {board.length > 0 && <RecentLaunches tokens={board} className="mt-6" />}
        {board.length > 0 && <TradeTicker tokens={board} className="mt-3" />}
        {featured && <FeaturedToken token={featured} reason={featuredReason} className="mt-4" />}
      </div>
      <section className="mx-auto max-w-6xl px-4 py-6" aria-labelledby="board-title">
        <h2 id="board-title" className="mb-3 text-xl font-semibold sm:text-2xl">
          Tokens
        </h2>
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
        <TrustStrip className="mt-8" />
      </section>
    </AppShell>
  );
}
