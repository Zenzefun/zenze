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
import { isCommunityLaunch } from "@/lib/team-wallets";
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
        "A calm, rules-up-front launchpad for community founders on Robinhood Chain. Fees and several admin powers are frozen at deploy and shown before you sign. Live launches are on Robinhood Chain. An Arc factory is deployed; community Arc launches have not started yet.",
      path: "/",
    }),
});

function Home() {
  const initial = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats(), initialData: initial.stats, refetchInterval: 15_000 });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens(), initialData: initial.tokens, refetchInterval: 15_000 });
  const board = tokens.data ?? [];
  const community = board.filter(isCommunityLaunch);
  // Featured slot: prefer community. Creator Quest finisher first, then closest to graduating, then newest.
  const questToken = (initial.questIds ?? []).map((id) => community.find((t: { id: unknown }) => String(t.id) === id)).find(Boolean) ?? null;
  const graduating = questToken ? null : pickAboutToGraduate(community);
  const featured = questToken ?? graduating ?? pickNewestCurve(community);
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
        {!tokens.isPending && board.filter(isCommunityLaunch).length === 0 && (
          <EmptyState
            title="Be one of the first community launches"
            body="The board may already show $ZNZF or team tokens. Community launches are separate. Name, describe, and deploy — fees and permissions are shown before you sign."
            actions={
              <>
                <Button asChild variant="gold">
                  <Link to="/start">How to launch</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/launch">Launch now</Link>
                </Button>
              </>
            }
          />
        )}
        <TrustStrip className="mt-8" />
      </section>
    </AppShell>
  );
}
