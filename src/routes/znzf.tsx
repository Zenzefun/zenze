import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { ShareX } from "@/components/share/share-x";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChainMark } from "@/components/chains/chain-mark";
import { ZnzfHero } from "@/components/capy/znzf-hero";
import { AddZnzfToWallet } from "@/components/wallet/add-token";
import { CHAINS, TOTAL_SUPPLY, TRADE_FEE_BPS, ZNZF_ID } from "@/lib/chains";
import { asNumber, formatAddress, formatCompact, formatUsdTiny, timeAgo } from "@/lib/format";
import { znzfLaunchpadId } from "@/lib/token-path";
import { publishedConfig } from "@/lib/onchain";
import { getToken, getWalletHoldings, protocolStats, publicConfig, stakingPage, znzfPage } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { tweetForPath } from "@/lib/og-copy";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/znzf")({
  loader: async () => {
    const [page, stats, cfg, live] = await Promise.all([
      znzfPage(),
      protocolStats(),
      publicConfig(),
      getToken({ data: { id: znzfLaunchpadId() } }),
    ]);
    return { page, stats, cfg, live };
  },
  component: Znzf,
  head: () => ({
    ...pageHead({
      title: "$ZNZF",
      description:
        "The $ZNZF pool on Robinhood Chain. Supply, the curve, the bridge to Arc, and the stake lock, on one page.",
      path: "/znzf",
      imageAlt: "$ZNZF — protocol token of Zenze.fun",
    }),
    links: [
      { rel: "canonical", href: "https://zenze.fun/znzf" },
      { rel: "preload", href: "/brand/capy-mark-512.webp", as: "image" },
    ],
  }),
});

function Znzf() {
  const loaded = Route.useLoaderData();
  const stats = useQuery({
    queryKey: ["stats"],
    queryFn: () => protocolStats(),
    initialData: loaded.stats,
    refetchInterval: 20_000,
  });
  const page = useQuery({
    queryKey: ["znzf"],
    queryFn: () => znzfPage(),
    initialData: loaded.page,
  });
  const cfg = useQuery({
    queryKey: ["public-config"],
    queryFn: () => publicConfig(),
    initialData: loaded.cfg ?? publishedConfig(),
  });
  const wallet = useWallet();
  const holdings = useQuery({
    queryKey: ["holdings", wallet.address],
    queryFn: () => getWalletHoldings({ data: { wallet: wallet.address! } }),
    enabled: Boolean(wallet.address),
  });
  const stake = useQuery({
    queryKey: ["staking", wallet.address],
    queryFn: () => stakingPage({ data: { wallet: wallet.address ?? undefined } }),
    refetchInterval: 15_000,
  });
  const bag = asNumber(holdings.data?.find((h) => h.token_id === ZNZF_ID)?.amount);
  const onchain = stake.data?.onchainZnzf ?? 0;
  const shownBag = Math.max(bag, onchain);
  const token = page.data?.token;
  const totalStaked = stake.data?.totalStaked ?? page.data?.totalStaked ?? 0;
  const robinhood = cfg.data?.znzf_robinhood?.startsWith("0x") ? cfg.data.znzf_robinhood : null;
  const arc = cfg.data?.znzf_arc?.startsWith("0x") ? cfg.data.znzf_arc : null;
  const poolId = znzfLaunchpadId();

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-10">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:items-center lg:gap-10">
          <div className="min-w-0">
            <Badge variant="gold">Protocol token</Badge>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">$ZNZF</h1>
            <p className="mt-2 text-base text-muted-foreground sm:text-lg">
              Buy it earlier and you pay less than the next buyer. You can sell it back into the same pool. The trade takes 2%. New buys stop once the pool has taken 2 ETH. It stays on this pool.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="gold">
                <Link to="/token/$id" params={{ id: poolId }}>
                  Buy $ZNZF
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/staking">Stake</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/governance">Governance</Link>
              </Button>
              <ShareX text={tweetForPath("/znzf")} path="/znzf" />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="font-display text-xl tabular-nums sm:text-2xl">{formatUsdTiny(token?.priceUsd)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Supply now</dt>
                <dd className="font-display text-xl tabular-nums sm:text-2xl">{formatCompact(TOTAL_SUPPLY - (stats.data?.burned ?? 0))}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Burned</dt>
                <dd className="font-display text-xl tabular-nums sm:text-2xl">{formatCompact(stats.data?.burned ?? 0)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Your bag</dt>
                <dd className="font-display text-xl tabular-nums sm:text-2xl">{wallet.connected ? shownBag.toLocaleString() : "—"}</dd>
              </div>
            </dl>
            <div className="mt-5 space-y-3">
              <ContractRow chain="robinhood" label="Canonical" address={robinhood} explorer={CHAINS.robinhood.explorer} />
              <ContractRow chain="arc" label="Bridged" address={arc} explorer={CHAINS.arc.explorer} />
            </div>
            <AddZnzfToWallet robinhood={robinhood} arc={arc} image={token?.image_url} />
          </div>
          <div className="relative mx-auto w-full max-w-[280px] sm:max-w-sm lg:max-w-none">
            <ZnzfHero />
          </div>
        </div>

        <section className="mt-12 sm:mt-14">
          <h2 className="text-2xl font-semibold">Utility</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/governance" className="stone-card rounded-xl p-4 transition-transform hover:-translate-y-0.5">
              <p className="font-medium">Governance</p>
              <p className="mt-2 text-sm text-muted-foreground">Vote weight is the $ZNZF locked in the stake contract. A balance that is not locked does not vote.</p>
            </Link>
            <div className="stone-card rounded-xl p-4">
              <p className="font-medium">Curve fee</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Every swap on this curve pays {((token?.feeBps ?? TRADE_FEE_BPS) / 100).toFixed(2)}%. Holding $ZNZF does not reduce it. There is no live rebate.
              </p>
            </div>
            <Link to="/staking" className="stone-card rounded-xl p-4 transition-transform hover:-translate-y-0.5">
              <p className="font-medium">Staking</p>
              <p className="mt-2 text-sm text-muted-foreground">Lock $ZNZF in the stake contract. The treasury funded 1,000 $ZNZF of rewards over 30 days. Claim pays that reward. It is not a fee share.</p>
              <p className="mt-3 text-sm tabular-nums text-stone">
                {formatCompact(totalStaked)} locked in the contract
              </p>
            </Link>
            <div className="stone-card rounded-xl p-4">
              <p className="font-medium">Buyback</p>
              <p className="mt-2 text-sm text-muted-foreground">A sweep can send 80% of the ETH in the fee vault to buyback. 20% stays in the vault. $ZNZF is burned only when that transaction runs. Arc does not burn.</p>
              <p className="mt-3 text-sm tabular-nums text-stone">
                {(page.data?.events ?? []).filter((e) => e.kind === "creator_bonus").length} nods so far
              </p>
            </div>
          </div>
        </section>

        <section className="mt-12 sm:mt-14">
          <h2 className="text-2xl font-semibold">Buyback, burn & creator nods</h2>
          {(page.data?.events ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No buybacks, burns, or creator nods yet. They post here when protocol fees actually buy $ZNZF or a pool graduates.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {(page.data?.events ?? []).map((e: any) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span className="capitalize">{e.kind.replace("_", " ")}</span>
                  <span className="tabular-nums">
                    {formatCompact(Number(e.amount))}
                    {e.kind === "burn" || e.kind === "buyback" ? " $ZNZF" : ""}
                  </span>
                  <span className="text-muted-foreground">{e.note}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ContractRow({
  chain,
  label,
  address,
  explorer,
}: {
  chain: "robinhood" | "arc";
  label: string;
  address: string | null;
  explorer: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <ChainMark chain={chain} className="size-5 shrink-0" />
      <span className="font-medium">{CHAINS[chain].name}</span>
      <Badge variant="steam">{label}</Badge>
      {address ? (
        <a
          className="break-all font-mono text-stone underline-offset-2 hover:underline"
          href={`${explorer}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {formatAddress(address)}
        </a>
      ) : (
        <span className="text-muted-foreground">Not published</span>
      )}
    </div>
  );
}
