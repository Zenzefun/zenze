import { pageHead } from "@/lib/seo";
import { tweetForPath } from "@/lib/og-copy";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Leaf, Shield, Sparkles, Waves } from "lucide-react";
import { SmartImage } from "@/components/media/smart-image";
import { AppShell } from "@/components/layout/app-shell";
import { ShareX } from "@/components/share/share-x";
import { TokenCard } from "@/components/tokens/token-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompact, formatEth, formatUsdMaybe, formatUsdTiny, timeAgo } from "@/lib/format";
import { listTokens, listTrades, protocolStats } from "@/lib/server/market";
import { znzfLaunchpadId } from "@/lib/token-path";

export const Route = createFileRoute("/")({
  loader: () => protocolStats(),
  component: Home,
  head: () =>
    pageHead({
      description:
        "Buy $ZNZF earlier and you pay less than the next buyer. You can sell it back into the same pool. The trade takes 2%.",
      path: "/",
    }),
});

function Home() {
  const initial = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats(), initialData: initial });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens() });
  const trades = useQuery({ queryKey: ["trades"], queryFn: () => listTrades() });
  const featured = [...(tokens.data ?? [])]
    .sort((a, b) => {
      const pin = Number(b.id === "znzf") - Number(a.id === "znzf");
      if (pin) return pin;
      return +new Date(b.created_at) - +new Date(a.created_at);
    })
    .slice(0, 6);

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-16">
        <div>
          <Badge variant="gold">$ZNZF</Badge>
          <h1 className="mt-4 text-4xl font-semibold text-stone sm:text-5xl md:text-6xl">
            Buy earlier. Pay less.
          </h1>
          <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">
            On the $ZNZF pool, the next buyer pays more than you did. You can sell it back into the same pool. The trade takes 2%.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="gold" size="lg">
              <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>Buy $ZNZF</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/launch">
                Launch a token <ArrowRight className="size-4" />
              </Link>
            </Button>
            <ShareX text={tweetForPath("/")} path="/" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Already have a contract?{" "}
            <Link to="/list" className="font-medium text-stone underline-offset-2 hover:underline">
              List it
            </Link>
            .
          </p>
        </div>
        <div className="relative">
          <SmartImage
            src="/brand/capy-zen.webp"
            alt="Capy, the zen capybara mascot of Zenze.fun, sitting on a river rock with a leaf on its head"
            width={960}
            height={720}
            priority
            className="aspect-[4/3] w-full rounded-2xl object-cover shadow-[0_24px_60px_-32px_rgba(107,79,58,0.45)]"
            rounded="2xl"
          />
          <div className="mt-4 rounded-xl bg-card p-4 shadow-sm sm:absolute sm:right-6 sm:bottom-5 sm:mt-0 sm:w-56 sm:bg-card/95">
            <p className="text-xs text-muted-foreground">Protocol token</p>
            <p className="font-display text-xl font-semibold">$ZNZF</p>
            <p className="text-sm tabular-nums text-moss">
              {stats.data?.znzfPriceUsd != null
                ? formatUsdTiny(stats.data.znzfPriceUsd)
                : stats.data?.znzfPriceNative
                  ? `${formatEth(stats.data.znzfPriceNative)} ETH`
                  : stats.isPending
                    ? "…"
                    : "Unpriced until first trade"}
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-sand/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Launched pools" value={stats.data ? String(stats.data.tokens) : "—"} />
          <Stat label="Listed tokens" value={stats.data ? String(stats.data.listed) : "—"} />
          <Stat
            label="24h volume"
            value={
              stats.data
                ? stats.data.volumeUsd != null
                  ? formatUsdMaybe(stats.data.volumeUsd)
                  : `${formatCompact(stats.data.volumeNative)} native`
                : "—"
            }
          />
          <Stat label="Holders" value={stats.data ? Number(stats.data.holders).toLocaleString() : "—"} />
          <Stat label="$ZNZF burned" value={stats.data ? formatCompact(stats.data.burned) : "—"} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold">Live pools</h2>
            <p className="mt-1 text-sm text-muted-foreground">Fresh launches and listings across both rivers.</p>
          </div>
          <Button asChild variant="ghost">
            <Link to="/explore">All pools</Link>
          </Button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tokens.isPending && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          {featured.map((t) => (
            <TokenCard key={t.id} token={t} />
          ))}
        </div>
        {!tokens.isPending && featured.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center">
            <SmartImage src="/brand/capy-sleep.webp" alt="" width={160} height={160} className="mx-auto w-40 rounded-xl" rounded="xl" />
            <p className="mt-4 text-muted-foreground">No community launches yet. Connect a wallet and be the first into the pool.</p>
            <Button asChild className="mt-4" variant="gold">
              <Link to="/launch">Launch a token</Link>
            </Button>
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-14 md:grid-cols-3">
        <Feature
          icon={Waves}
          title="Your launch"
          body="You set the creator share, and you keep it. Buyers of your token pay less if they buy earlier."
        />
        <Feature
          icon={Sparkles}
          title="Capy AI"
          body="Ask Capy to read a pool when you want a second look. It stays quiet until you ask."
          to="/capyai"
        />
        <Feature
          icon={Shield}
          title="$ZNZF"
          body="Buying it is how you earn points. When the pool opens, those points split it. One point is the same share for every wallet."
          to="/airdrop"
        />
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 md:grid-cols-2">
        <SmartImage src="/brand/onsen-landscape.webp" alt="A quiet onsen, the same pool on either side" width={960} height={540} className="aspect-[16/9] w-full rounded-2xl object-cover" rounded="2xl" />
        <div>
          <Badge variant="steam">Two networks</Badge>
          <h2 className="mt-3 text-3xl font-semibold">Same coin. Other network.</h2>
          <p className="mt-3 text-muted-foreground">
            Lock $ZNZF here and the same amount shows up there. Nothing extra is created.
          </p>
          <Button asChild className="mt-5" variant="outline">
            <Link to="/bridge">Bridge</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-center gap-2">
            <Leaf className="size-4 text-moss" />
            <h2 className="text-xl font-semibold">Recent ripples</h2>
          </div>
          {(trades.data ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No trades yet. The tape fills when wallets buy and sell.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {(trades.data ?? []).slice(0, 8).map((t: any) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <span className="font-medium">{t.side === "buy" ? "Bought" : "Sold"}</span> ${t.symbol}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{timeAgo(t.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-14">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
  to,
}: {
  icon: typeof Waves;
  title: string;
  body: string;
  to?: "/capyai" | "/znzf" | "/bridge" | "/explore" | "/airdrop";
}) {
  const inner = (
    <>
      <Icon className="size-5 text-stone" />
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="stone-card rounded-xl p-5 transition-transform hover:-translate-y-0.5">
        {inner}
      </Link>
    );
  }
  return <div className="stone-card rounded-xl p-5">{inner}</div>;
}
