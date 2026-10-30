import { pageHead } from "@/lib/seo";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { RecentLaunches, TokenBoard } from "@/components/tokens/token-board";
import { Button } from "@/components/ui/button";
import { TokenListSkeleton } from "@/components/ui/skeleton";
import { FeaturedToken } from "@/components/home/featured-token";
import { FreshLaunchesFeed } from "@/components/home/fresh-launches-feed";
import { HomeHero } from "@/components/home/home-hero";
import { TaglineReveal } from "@/components/home/tagline-reveal";
import { TradeTicker } from "@/components/home/trade-ticker";
import { EmptyState } from "@/components/site/empty-state";
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
      <FreshLaunchesFeed tokens={board} />
      <TaglineReveal />
      <section className="mx-auto max-w-6xl px-4 py-6" aria-labelledby="board-title">
        <h2 id="board-title" className="mb-4 text-2xl font-semibold">
          Tokens
        </h2>
        {tokens.isPending && <TokenListSkeleton />}
        <TokenBoard tokens={board} />
        {!tokens.isPending && board.length === 0 && (
          <EmptyState
            title="No tokens yet"
            body="Be the first to open a pool. Name a token and it can trade the moment it launches."
            actions={
              <Button asChild variant="gold">
                <Link to="/launch">Launch a token</Link>
              </Button>
            }
          />
        )}
        <TrustStrip className="mt-8" />
      </section>
    </AppShell>
  );
}
