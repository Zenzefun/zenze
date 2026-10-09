import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { QuoteMark } from "@/components/chains/quote-mark";
import { CHAINS, type ChainKey } from "@/lib/chains";
import { formatCompact, formatEth, formatUsd, formatUsdTiny, timeAgo } from "@/lib/format";
import { dayChange } from "@/lib/day-change";
import { tokenRouteId } from "@/lib/token-path";
import { analyticsPage } from "@/lib/server/market";
import { PAIR_ASSETS } from "@/lib/pairs";
import { publishedConfig } from "@/lib/onchain";
import { pageHead } from "@/lib/seo";
import { QueryError } from "@/components/site/query-error";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  loader: () => analyticsPage(),
  component: Analytics,
  head: () =>
    pageHead({
      title: "Analytics",
      description: "Volume, launches, and balances on the live contracts.",
      path: "/analytics",
    }),
});

type Range = "24h" | "all";

function shortAddr(value?: string | null) {
  if (!value || !value.startsWith("0x")) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function changeLabel(current: number, prior: number, priorText?: string) {
  return dayChange(current, prior, priorText);
}

const KIND_LABEL: Record<string, string> = {
  native: "Gas",
  stable: "Stable",
  stock: "Stock",
  protocol: "Token",
};

type Pair = (typeof PAIR_ASSETS)[number];

function priceOf(asset: Pair, prices?: Record<string, number | null>) {
  const px = prices?.[asset.key] ?? asset.refUsd ?? (asset.kind === "stable" || asset.key === "usdc" || asset.key === "usdg" ? 1 : null);
  return px ?? null;
}

function Analytics() {
  const initial = Route.useLoaderData();
  const q = useQuery({
    queryKey: ["analytics"],
    queryFn: () => analyticsPage(),
    initialData: initial,
    refetchInterval: 15_000,
  });
  const data = q.data ?? initial;
  const [range, setRange] = useState<Range>("24h");
  const ready = Boolean(data?.volume && data?.fees?.splitter && data?.fees?.escrow && data?.fees?.intake && data?.dune && data?.contracts && data?.series);
  if (!ready || !data) {
    return (
      <AppShell znzfPrice={data?.stats?.znzfPriceUsd}>
        <QueryError onRetry={() => void q.refetch()} message="Could not load this page." />
      </AppShell>
    );
  }
  const stats = data.stats;
  const volume = range === "24h" ? data.volume.h24 : data.volume.all;
  const launches = range === "24h" ? data.launches.h24 : data.launches.all;
  const devs = range === "24h" ? data.devs.h24 : data.devs.all;
  const cfg = publishedConfig();
  const pairs = (data.pairs ?? PAIR_ASSETS) as Pair[];
  const corePairs = pairs.filter((asset) => asset.kind !== "stock");
  const stockPairs = pairs.filter((asset) => asset.kind === "stock");

  return (
    <AppShell znzfPrice={stats?.znzfPriceUsd}>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Analytics</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span className={cn("size-1.5 rounded-full bg-moss", q.isFetching && "animate-pulse")} />
              Live
            </p>
          </div>
          <div className="flex gap-2">
            {(["24h", "all"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={cn(
                  "h-9 rounded-full border px-4 text-sm",
                  range === id ? "border-foreground bg-foreground text-background" : "border-border bg-card",
                )}
              >
                {id === "24h" ? "24h" : "All time"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label={range === "24h" ? "Volume" : "Volume, all time"}
            value={formatUsd(volume)}
            note={range === "24h" ? changeLabel(data.volume.h24, data.volume.prior, formatUsd(data.volume.prior)) : ""}
          />
          <Stat
            label={range === "24h" ? "Launches" : "Launches, all time"}
            value={launches.toLocaleString()}
            note={range === "24h" ? changeLabel(data.launches.h24, data.launches.prior) : "Besides $ZNZF"}
          />
          <Stat
            label="Launchers"
            value={devs.toLocaleString()}
            note={range === "24h" ? "Last 24h" : "All time"}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Series title="Volume" total={formatUsd(data.volume.all)} points={data.series.volume} format={(n) => formatUsd(n)} />
          <Series title="Launches" total={data.launches.all.toLocaleString()} points={data.series.launches} format={(n) => n.toLocaleString()} />
        </div>

        <section>
          <h2 className="text-xl font-semibold">Fees</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <FeeCard label="Buyback" bucket={data.fees.splitter} />
            <FeeCard label="Unclaimed" bucket={data.fees.escrow} />
            <FeeCard label="Intake" bucket={data.fees.intake} />
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Fact label="Fee vault" value={data.fees.vaultUsd == null ? `${formatEth(data.fees.vaultEth)} ETH` : formatUsd(data.fees.vaultUsd)} />
            <Fact label="Burned" value={`${formatCompact(data.fees.burned)} $ZNZF`} />
            <Fact label="On Arc" value={data.fees.arcSupply == null ? "—" : `${formatCompact(data.fees.arcSupply)} $ZNZF`} />
          </dl>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Contracts</h2>
          <div className="stone-card mt-4 divide-y divide-border rounded-2xl px-4">
            {data.contracts.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{row.label}</span>
                {row.status === "live" ? (
                  <a
                    href={`${CHAINS[row.chain as ChainKey].explorer}/address/${row.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-stone hover:text-gold"
                  >
                    {shortAddr(row.address)}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not live</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Pairs</h2>
          <div className="stone-card mt-4 overflow-hidden rounded-2xl">
            <table className="w-full text-left text-sm">
              <tbody>
                {corePairs.map((p) => (
                  <PairRow key={p.key} asset={p} cfg={cfg} price={priceOf(p, data.prices)} />
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="mt-8 text-xl font-semibold">Stocks</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {stockPairs.map((p) => {
              const chain = p.chains[0] as ChainKey;
              const addr = p.address[chain];
              const href = addr ? `${CHAINS[chain].explorer}/token/${addr}` : undefined;
              const px = priceOf(p, data.prices);
              const body = (
                <>
                  <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                    <QuoteMark quote={p.key} className="size-5 shrink-0" />
                    <span className="truncate">${p.symbol}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{px == null ? "—" : formatUsdTiny(px)}</span>
                </>
              );
              return href ? (
                <a key={p.key} href={href} target="_blank" rel="noopener noreferrer" className="stone-card flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm">
                  {body}
                </a>
              ) : (
                <div key={p.key} className="stone-card flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm">
                  {body}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold">Pools</h2>
          {data.recent.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No launches yet.</p> : null}
          <ul className="mt-4 space-y-2">
            {(data.recent as Array<{ id: string; symbol?: string; name?: string; chain?: string; contract_address?: string | null; created_at?: string }>).map((t) => (
              <li key={t.id}>
                <Link to="/token/$id" params={{ id: tokenRouteId(t) }} className="stone-card flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-4 py-3 text-sm">
                  <span className="font-medium">${t.symbol} <span className="font-normal text-muted-foreground">{t.name}</span></span>
                  <span className="text-xs text-muted-foreground">
                    {CHAINS[t.chain as ChainKey]?.short ?? t.chain}
                    {t.contract_address ? ` · ${shortAddr(t.contract_address)}` : ""}
                    {" · "}
                    {timeAgo(t.created_at ?? "")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function FeeCard({
  label,
  bucket,
}: {
  label: string;
  bucket: {
    deployed: boolean;
    usd: number | null;
    native: number;
    pairCount: number;
    rows: { symbol: string; usd: number | null }[];
    empty: boolean;
  };
}) {
  const headline = !bucket.deployed ? "Not live" : bucket.usd == null ? "No price" : formatUsd(bucket.usd);
  const note = !bucket.deployed ? "" : bucket.empty ? "Empty" : `${bucket.native.toLocaleString(undefined, { maximumFractionDigits: bucket.native > 0 && bucket.native < 0.01 ? 8 : 2 })} ETH · ${bucket.pairCount} other`;
  return (
    <div className="stone-card rounded-2xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{headline}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
      {bucket.rows.length > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          {bucket.rows.map((row) => (
            <div key={row.symbol} className="flex items-baseline justify-between gap-3">
              <dt>{row.symbol}</dt>
              <dd className="tabular-nums text-muted-foreground">{row.usd == null ? "—" : formatUsdTiny(row.usd)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="stone-card rounded-2xl px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function PairRow({ asset, cfg, price }: { asset: Pair; cfg: Record<string, string>; price: number | null }) {
  const chain = (asset.key === "znzf" ? "robinhood" : asset.chains[0]) as ChainKey;
  const addr = asset.key === "znzf" ? cfg.znzf_robinhood || cfg.znzf_arc || "" : asset.address[chain] || "";
  const href = addr ? `${CHAINS[chain].explorer}/token/${addr}` : null;
  return (
    <tr className="border-t border-border first:border-t-0">
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-2 font-medium">
          <QuoteMark quote={asset.key} className="size-5" />${asset.symbol}
          <span className="hidden font-normal text-muted-foreground sm:inline">{asset.name}</span>
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{price == null ? "—" : formatUsdTiny(price)}</td>
      <td className="hidden px-4 py-3 text-right text-muted-foreground sm:table-cell">{KIND_LABEL[asset.kind] ?? asset.kind}</td>
      <td className="px-4 py-3 text-right font-mono text-xs">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-stone hover:text-gold">
            {shortAddr(addr)}
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="stone-card rounded-2xl p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Series({
  title,
  total,
  points,
  format,
}: {
  title: string;
  total: string;
  points: { day: string; value: number }[];
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <section className="stone-card rounded-2xl p-5">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      <p className="mt-1 font-display text-3xl tabular-nums">{total}</p>
      <div className="mt-5 flex h-36 items-end gap-1 border-b border-border">
        {points.map((p, i) => (
          <div key={p.day} className="flex h-full min-w-0 flex-1 items-end" title={`${p.day} ${format(p.value)}`}>
            <div
              className={cn("w-full rounded-t", p.value > 0 ? (i === points.length - 1 ? "bg-foreground" : "bg-moss") : "bg-transparent")}
              style={{ height: p.value <= 0 ? 0 : `${Math.max(8, (p.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{first ? first.day.slice(5) : ""}</span>
        <span>{last ? last.day.slice(5) : ""}</span>
      </div>
    </section>
  );
}
