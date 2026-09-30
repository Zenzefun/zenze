import { AppShell } from "@/components/layout/app-shell";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { ChainMark } from "@/components/chains/chain-mark";
import { QuoteMark } from "@/components/chains/quote-mark";
import { ShareX } from "@/components/share/share-x";
import { GraduationCard } from "@/components/tokens/graduation-card";
import { CreatorFees } from "@/components/tokens/creator-fees";
import { HolderFees } from "@/components/tokens/holder-fees";
import { PriceChart } from "@/components/tokens/price-chart";
import { TradePanel } from "@/components/tokens/trade-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ZERO_ADDRESS } from "@/lib/chains";
import { asNumber, formatAddress, formatCompact, formatEth, formatMcap, formatUsdTiny, timeAgo } from "@/lib/format";
import { ogDescriptionForToken, ogTitleForToken, tokenSharePath, tweetForToken } from "@/lib/og-copy";
import { pairLabel } from "@/lib/pairs";
import { SmartImage, TokenImage } from "@/components/media/smart-image";
import { HomeButton } from "@/components/site/home-button";
import { hasQuotedPool, hasTradablePool, isGraduatedPool, isProtocolToken } from "@/lib/pool";
import { analyzeToken } from "@/lib/server/ai";
import { getToken, protocolStats } from "@/lib/server/market";
import { cardUrl, pageHead } from "@/lib/seo";
import { QueryError } from "@/components/site/query-error";
import { PublicNotFound } from "@/components/not-found-public";
import { isHexAddress } from "@/lib/intent";
import { isZnzfRef, znzfLaunchpadId } from "@/lib/token-path";
import { cleanTokenName } from "@/lib/token-name";
import type { TradeRow } from "@/lib/types";
import { AddTokenButton } from "@/components/wallet/add-token";

export const Route = createFileRoute("/token/$id")({
  loader: async ({ params }) => {
    if (isZnzfRef(params.id)) {
      const canonical = znzfLaunchpadId();
      if (canonical.startsWith("0x") && params.id !== canonical) {
        throw redirect({ to: "/token/$id", params: { id: canonical }, statusCode: 301 });
      }
    } else if (isHexAddress(params.id)) {
      try {
        const checksum = getAddress(params.id);
        if (checksum !== params.id) {
          throw redirect({ to: "/token/$id", params: { id: checksum } });
        }
      } catch (err) {
        if (err && typeof err === "object" && "to" in err) throw err;
      }
    }
    const data = await getToken({ data: { id: params.id } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const token = loaderData?.token;
    const ticker = token?.symbol ?? params.id.toUpperCase();
    const name = token?.name ?? ticker;
    const path = token ? tokenSharePath(token.id, token.contract_address) : tokenSharePath(params.id);
    const image = cardUrl(isZnzfRef(params.id) ? "znzf" : params.id);
    if (!token) {
      return pageHead({
        title: `$${ticker}`,
        description: `${name} ($${ticker}) on Zenze.fun.`,
        path,
        image,
        imageAlt: `$${ticker} on Zenze.fun`,
      });
    }
    return pageHead({
      title: isZnzfRef(params.id) ? "Buy $ZNZF" : ogTitleForToken(token),
      description: ogDescriptionForToken(token),
      path,
      image,
      imageAlt: `$${ticker} — ${name} on Zenze.fun`,
    });
  },
  component: TokenPage,
  notFoundComponent: PublicNotFound,
});

function TokenPage() {
  const { id } = Route.useParams();
  const loaded = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const q = useQuery({
    queryKey: ["token", id],
    queryFn: () => getToken({ data: { id } }),
    initialData: loaded ?? undefined,
    refetchInterval: 15_000,
  });
  const ai = useMutation({
    mutationFn: () => analyzeToken({ data: { id } }),
    onError: () => toast.error("Capy could not read this pool just now."),
  });

  if (q.isPending) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl px-3 py-8 sm:px-4">
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </AppShell>
    );
  }
  if (q.isError) {
    return (
      <AppShell>
        <QueryError onRetry={() => void q.refetch()} message="This pool could not be read just now." />
      </AppShell>
    );
  }
  if (!q.data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-sm px-4 py-16 text-center">
          <SmartImage src="/brand/capy-sleep.webp" alt="" width={192} height={192} className="mx-auto w-48 rounded-xl" rounded="xl" />
          <p className="mt-4">This pool is empty.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <HomeButton />
            <Button asChild variant="outline">
              <Link to="/explore">Back to explore</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const { token, trades: rawTrades } = q.data;
  const trades = rawTrades as TradeRow[];
  const analysis = ai.data && ai.data.ok ? ai.data : null;
  const live = hasQuotedPool(token);
  const onchain = hasTradablePool(token);
  const protocol = isProtocolToken(token);
  const graduated = isGraduatedPool(token);
  let chartPoints = trades
    .filter((t) => asNumber(t.price) > 0)
    .map((t) => ({ t: t.created_at, p: asNumber(t.price) }));
  if (chartPoints.length === 0 && live && token.price > 0) {
    const now = Date.now();
    chartPoints = [
      { t: new Date(now - 3_600_000).toISOString(), p: token.price },
      { t: new Date(now).toISOString(), p: token.price },
    ];
  }
  const creator = token.creator_wallet === ZERO_ADDRESS ? "Protocol" : formatAddress(token.creator_wallet);
  const explorerAddr = token.contract_address || (isZnzfRef(token.id) ? znzfLaunchpadId() : null);
  const displayName = cleanTokenName(token.name, token.symbol);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!explorerAddr) return;
    try {
      await navigator.clipboard.writeText(explorerAddr);
      setCopied(true);
      toast.success("Contract address copied.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the address.");
    }
  }

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 px-3 py-5 sm:gap-6 sm:px-4 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <div className="flex items-start gap-4 sm:gap-5">
            <TokenImage
              src={token.image_url}
              alt={displayName}
              size={128}
              priority
              seed={token.id}
              protocol={protocol}
              className="size-20 shrink-0 sm:size-28 md:size-32"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="break-words text-2xl font-semibold sm:text-3xl">{displayName}</h1>
                <span className="shrink-0 text-muted-foreground">${token.symbol}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="steam" className="gap-1">
                  <ChainMark chain={token.chain.key} className="size-3" />
                  {token.chain.name}
                </Badge>
                {live && (
                  <Badge variant="gold" className="gap-1">
                    <QuoteMark quote={token.quote.key} className="size-3" />
                    {pairLabel(token.symbol, token.quote)}
                  </Badge>
                )}
                <Badge variant={token.band.key === "calm" ? "moss" : token.band.key === "storm" ? "blossom" : "sand"}>
                  {token.band.label}
                </Badge>
                {token.source === "listed" && !protocol && <Badge variant="outline">Listed</Badge>}
                {graduated && <Badge variant="outline">Graduated</Badge>}
                {protocol && !graduated && <Badge variant="gold">Protocol</Badge>}
              </div>
            </div>
          </div>
          <p className="mt-4 max-w-2xl break-words text-sm text-muted-foreground sm:text-base">{token.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">Creator {creator}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {explorerAddr ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void copyAddress()}>
                {copied ? "Copied" : "Copy address"}
              </Button>
            ) : null}
            {explorerAddr ? (
              <AddTokenButton
                address={explorerAddr}
                symbol={token.symbol}
                name={displayName}
                image={token.image_url}
                chain={token.chain.key}
                label="Add to wallet"
              />
            ) : null}
            <ShareX text={tweetForToken(token)} path={tokenSharePath(token.id, token.contract_address)} size="sm" />
            {token.website ? (
              <Button asChild variant="outline" size="sm">
                <a href={token.website} target="_blank" rel="noopener noreferrer">
                  Website
                </a>
              </Button>
            ) : null}
            {token.twitter ? (
              <Button asChild variant="outline" size="sm">
                <a href={token.twitter} target="_blank" rel="noopener noreferrer">
                  X
                </a>
              </Button>
            ) : null}
            {token.telegram ? (
              <Button asChild variant="outline" size="sm">
                <a href={token.telegram} target="_blank" rel="noopener noreferrer">
                  Telegram
                </a>
              </Button>
            ) : null}
            {protocol && (
              <Button asChild variant="gold" size="sm">
                <Link to="/znzf">$ZNZF protocol</Link>
              </Button>
            )}
            {explorerAddr && (
              <Button asChild variant="outline" size="sm">
                <a href={`${token.chain.explorer}/token/${explorerAddr}`} target="_blank" rel="noopener noreferrer">
                  Explorer
                </a>
              </Button>
            )}
          </div>
        </div>

        <aside id="swap" className="min-w-0 scroll-mt-24 space-y-4 lg:sticky lg:top-20 lg:row-span-4 lg:self-start">
          {live ? (
            <>
              <GraduationCard token={token} />
              <CreatorFees token={token} />
              <HolderFees token={token} />
              <div className="stone-card overflow-visible rounded-xl p-3 sm:p-4">
                <p className="mb-3 text-sm font-medium">
                  {onchain ? "Swap on the bonding curve" : "Bonding curve · opening quote"}
                </p>
                <TradePanel token={token} onTraded={() => void q.refetch()} />
              </div>
            </>
          ) : (
            <div className="stone-card rounded-xl p-4">
              <p className="font-medium">{token.source === "listed" ? "Listed token" : "Curve closed"}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {token.source === "listed"
                  ? "This contract is indexed on Zenze.fun. Trade it in your wallet or on the explorer."
                  : "This curve is closed. New buys have stopped. This deployment does not move liquidity to Uniswap."}
              </p>
              {token.contract_address ? (
                <a
                  className="mt-4 inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
                  href={`${token.chain.explorer}/token/${token.contract_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open explorer
                </a>
              ) : null}
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <div className="stone-card overflow-hidden rounded-xl p-3 sm:p-4">
            <PriceChart
              points={chartPoints}
              accent={token.band.key === "storm" ? "#E8A5A5" : "#7C9A5C"}
              unit={live ? `${token.quote.symbol} / token` : "price"}
              quoteUsd={token.quoteUsd ?? (token.quote.kind === "stable" || token.quote.key === "usdc" || token.quote.key === "usdg" ? 1 : token.ethUsd)}
              currentPrice={token.price}
              currentPriceUsd={token.priceUsd}
              currentMcap={live && token.priceUsd != null ? token.mcap : null}
              empty={
                live
                  ? "Chart opens with the first on-chain trade."
                  : "No pool yet. A chart appears when this token trades on a live curve."
              }
            />
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Price" value={live ? formatUsdTiny(token.priceUsd) : "—"} />
            <Metric label="Market cap" value={live ? formatMcap(token.mcap, token.priceUsd, token.quote.symbol) : "—"} />
            <Metric label="Holders" value={token.holders.toLocaleString()} />
            <Metric
              label={live ? `Curve ${token.quote.symbol}` : "Liquidity"}
              value={live ? formatEth(token.curve.realBase) : "—"}
            />
          </dl>
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium">Capy read</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {token.band.hint} Rug signal {token.rug_probability}%.
            </p>
            <Button className="mt-3" variant="outline" disabled={ai.isPending} onClick={() => ai.mutate()}>
              {ai.isPending ? "Capy is reading…" : "Ask Capy to analyze"}
            </Button>
            {analysis ? <p className="mt-3 text-sm text-muted-foreground">{analysis.summary}</p> : null}
          </div>
          <div>
            <h2 className="text-lg font-semibold">Trades</h2>
            <ul className="mt-3 divide-y divide-border">
              {trades.length === 0 && <li className="py-4 text-sm text-muted-foreground">No trades yet.</li>}
              {trades
                .slice()
                .reverse()
                .slice(0, 24)
                .map((t) => (
                  <li key={t.id} className="grid grid-cols-2 gap-x-2 gap-y-1 py-2 text-sm sm:flex sm:flex-wrap sm:justify-between">
                    <span className="font-medium capitalize">{t.side}</span>
                    <span className="tabular-nums">
                      {formatCompact(asNumber(t.token_amount))} {token.symbol}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatEth(asNumber(t.base_amount))} {token.quote.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(t.created_at)}</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="stone-card min-w-0 rounded-xl p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium tabular-nums">{value}</p>
    </div>
  );
}
