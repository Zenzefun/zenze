import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { SmartImage, TokenImage } from "@/components/media/smart-image";
import { HomeButton } from "@/components/site/home-button";
import { Button } from "@/components/ui/button";
import { asNumber, formatCompact, formatEth, formatUsdMaybe } from "@/lib/format";
import { tokenRouteId } from "@/lib/token-path";
import { getWalletHoldings, listTokens, protocolStats, walletSeat } from "@/lib/server/market";
import { HolderFeeClaimButton } from "@/components/tokens/holder-fees";
import { pageHead } from "@/lib/seo";
import { nativeSymbol, networkLabel, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/portfolio")({
  component: Portfolio,
  head: () =>
    pageHead({
      title: "Portfolio",
      description: "What you hold, how long you have stayed, and the fees you can claim.",
      path: "/portfolio",
      index: false,
    }),
});

function Seat({ wallet }: { wallet: string }) {
  const seat = useQuery({
    queryKey: ["seat", wallet],
    queryFn: () => walletSeat({ data: { wallet } }),
  });
  const row = seat.data;
  return (
    <div className="mt-6 rounded-xl border border-border bg-card px-4 py-4">
      <p className="text-xs text-muted-foreground">Your seat</p>
      {seat.isPending && <p className="mt-1 text-sm text-muted-foreground">Reading your history…</p>}
      {row && (
        <>
          <p className="mt-1 font-display text-2xl font-semibold">{row.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{row.line}</p>
          <p className="mt-2 text-sm">
            {row.paying > 0
              ? `${row.paying} of your tokens pay holders. The claim is on that row.`
              : "Fees land on a pool only when its creator turned sharing on."}
          </p>
        </>
      )}
    </div>
  );
}

function Portfolio() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens() });
  const wallet = useWallet();
  const holdings = useQuery({
    queryKey: ["holdings", wallet.address],
    queryFn: () => getWalletHoldings({ data: { wallet: wallet.address! } }),
    enabled: Boolean(wallet.address),
  });
  const gas = nativeSymbol(wallet.chainId);
  const rows = (holdings.data ?? []).map((h: any) => {
    const t = tokens.data?.find((x) => x.id === h.token_id);
    return { id: String(h.token_id), amt: asNumber(h.amount), t };
  });
  const created = (tokens.data ?? []).filter(
    (t) => wallet.address && t.creator_wallet?.toLowerCase() === wallet.address,
  );

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Your wallet</h1>
        <p className="mt-2 text-muted-foreground">What you hold, how long you have stayed, and the fees waiting on pools that pay holders.</p>
        {!wallet.connected ? (
          <div className="mt-8 max-w-sm text-center">
            <SmartImage src="/brand/capy-sleep.webp" alt="" width={160} height={160} className="mx-auto w-40 rounded-xl" rounded="xl" />
            <p className="mt-4 text-muted-foreground">Connect a browser wallet to see live balances and curve holdings.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Button variant="gold" onClick={() => void wallet.connect().catch(() => undefined)}>
                Connect wallet
              </Button>
              <HomeButton variant="outline" />
            </div>
            {wallet.error && !/dummy|stub|not implemented/i.test(wallet.error) && (
              <p className="mt-3 text-sm text-destructive">{wallet.error}</p>
            )}
          </div>
        ) : (
          <>
            <p className="mt-2 font-mono text-xs text-muted-foreground break-all">{wallet.address}</p>
            <Seat wallet={wallet.address} />
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="stone-card rounded-xl p-4">
                <dt className="text-xs text-muted-foreground">Network</dt>
                <dd className="mt-1 text-sm">{networkLabel(wallet.chainId)}</dd>
              </div>
              <div className="stone-card rounded-xl p-4">
                <dt className="text-xs text-muted-foreground">{gas}</dt>
                <dd className="mt-1 font-display text-xl tabular-nums">{formatEth(wallet.native)}</dd>
              </div>
              <div className="stone-card rounded-xl p-4">
                <dt className="text-xs text-muted-foreground">Curve positions</dt>
                <dd className="mt-1 font-display text-xl tabular-nums">{rows.length}</dd>
              </div>
            </dl>
            <h2 className="mt-10 text-xl font-semibold">Holdings</h2>
            <ul className="mt-4 divide-y divide-border">
              {rows.length === 0 && (
                <li className="py-8 text-sm text-muted-foreground">No curve holdings for this address yet.</li>
              )}
              {rows.map(({ id, amt, t }) => (
                <li key={id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    {t && <TokenImage src={t.image_url} alt="" size={40} seed={t.id} className="size-10 rounded-full object-cover" />}
                    <div>
                      <p className="font-medium">{t?.name ?? id}</p>
                      <p className="text-xs text-muted-foreground">${t?.symbol}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums">{formatCompact(amt)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t?.priceUsd != null ? formatUsdMaybe(amt * t.priceUsd) : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t && <HolderFeeClaimButton token={t} />}
                    <Button asChild size="sm" variant="outline">
                      <Link to="/token/$id" params={{ id: t ? tokenRouteId(t) : id }}>Open</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {created.length > 0 && (
              <>
                <h2 className="mt-10 text-xl font-semibold">Pools you created</h2>
                <ul className="mt-4 divide-y divide-border">
                  {created.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3">
                        <TokenImage src={t.image_url} alt="" size={40} seed={t.id} className="size-10 rounded-full object-cover" />
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">${t.symbol} · claim fees on the token page</p>
                        </div>
                      </div>
                      <Button asChild size="sm" variant="gold">
                        <Link to="/token/$id" params={{ id: tokenRouteId(t) }}>Claim</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
