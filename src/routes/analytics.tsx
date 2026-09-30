import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { QuoteMark } from "@/components/chains/quote-mark";
import { CHAINS, type ChainKey } from "@/lib/chains";
import { formatCompact, formatEth, formatUsd, formatUsdMaybe, timeAgo } from "@/lib/format";
import { tokenRouteId } from "@/lib/token-path";
import { analyticsPage } from "@/lib/server/market";
import { PAIR_ASSETS } from "@/lib/pairs";
import { pageHead } from "@/lib/seo";
import { QueryError } from "@/components/site/query-error";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  loader: () => analyticsPage(),
  component: Analytics,
  head: () =>
    pageHead({
      title: "Analytics",
      description: "What people actually traded. A zero means nobody traded. Nothing on this page is a guess.",
      path: "/analytics",
    }),
});

type Range = "24h" | "all";

function shortAddr(value?: string | null) {
  if (!value || !value.startsWith("0x")) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function changeLabel(current: number, prior: number) {
  if (prior === 0 && current === 0) return "0% from prior day";
  if (prior === 0) return "No prior day to compare";
  const pct = ((current - prior) / prior) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}% from prior day`;
}

function Analytics() {
  const initial = Route.useLoaderData();
  const q = useQuery({
    queryKey: ["analytics"],
    queryFn: () => analyticsPage(),
    initialData: initial,
  });
  const data = q.data ?? initial;
  const [range, setRange] = useState<Range>("24h");
  const ready = Boolean(data?.volume && data?.fees?.splitter && data?.fees?.escrow && data?.fees?.intake && data?.dune && data?.contracts && data?.series);
  if (!ready || !data) {
    return (
      <AppShell znzfPrice={data?.stats?.znzfPriceUsd}>
        <QueryError onRetry={() => void q.refetch()} message="Analytics did not load. No figure on this page is guessed." />
      </AppShell>
    );
  }
  const stats = data.stats;
  const volume = range === "24h" ? data.volume.h24 : data.volume.all;
  const launches = range === "24h" ? data.launches.h24 : data.launches.all;
  const devs = range === "24h" ? data.devs.h24 : data.devs.all;
  const read = new Date(data.readAt);

  return (
    <AppShell znzfPrice={stats?.znzfPriceUsd}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Protocol analytics</p>
        <h1 className="mt-1 text-3xl font-semibold">Analytics</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          What people actually traded. A zero means nobody traded. Nothing on this page is a guess. Read {read.toLocaleString()}.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(["24h", "all"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={cn(
                "h-8 rounded-full border px-3 text-sm",
                range === id ? "border-foreground bg-foreground text-background" : "border-border bg-card",
              )}
            >
              {id === "24h" ? "24h" : "All time"}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat
            label={range === "24h" ? "24h volume" : "All-time volume"}
            value={formatUsdMaybe(volume)}
            note={range === "24h" ? changeLabel(data.volume.h24, data.volume.prior) : "Sum of recorded trades"}
          />
          <Stat
            label={range === "24h" ? "24h launches" : "All-time launches"}
            value={launches.toLocaleString()}
            note={range === "24h" ? changeLabel(data.launches.h24, data.launches.prior) : "Community pools. $ZNZF is the protocol curve, not a launch."}
          />
          <Stat
            label="Unique token devs"
            value={devs.toLocaleString()}
            note={range === "24h" ? "Wallets that launched in 24h" : "Lifetime total"}
          />
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Buyback and burn</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Balances are read from the splitter, the fee intake, and unclaimed creator escrow on each curve. Assets are marked at the reference price. Nothing is estimated.
          </p>
          <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-3">
            <FeeCard
              label="In the buyback splitter"
              bucket={data.fees.splitter}
              empty="Nothing held right now"
            />
            <FeeCard
              label="Unclaimed in escrow"
              bucket={data.fees.escrow}
              empty="Nothing held right now"
            />
            <FeeCard
              label="Waiting at the intake"
              bucket={data.fees.intake}
              empty="Nothing held right now"
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {!data.fees.splitter.deployed || !data.fees.intake.deployed
              ? "The splitter and the intake are not deployed, so those reads stay unavailable. "
              : "Pair assets in the splitter are held, not swapped. "}
            Trade fees on the live $ZNZF curve still go to the fee vault{" "}
            {data.fees.vaultUsd == null ? ` (${formatEth(data.fees.vaultEth)} ETH)` : ` (${formatUsd(data.fees.vaultUsd)}, ${formatEth(data.fees.vaultEth)} ETH)`}.
            That recipient was fixed at deploy and cannot be redirected. Burned by the existing burner: {formatCompact(data.fees.burned)} $ZNZF.
            Arc $ZNZF supply is {data.fees.arcSupply == null ? "unread" : data.fees.arcSupply.toLocaleString()}.
          </p>
        </section>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <Series title="Trading volume" total={formatUsdMaybe(data.volume.all)} points={data.series.volume} format={(n) => formatUsdMaybe(n)} />
          <Series title="Token launches" total={data.launches.all.toLocaleString()} points={data.series.launches} format={(n) => n.toLocaleString()} />
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Published contracts</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.contracts.map((row) => (
              <div key={row.label} className="rounded-xl border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="mt-1 font-mono text-sm">
                  {row.status === "live" ? (
                    <a
                      href={`${CHAINS[row.chain as ChainKey].explorer}/address/${row.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone hover:text-gold"
                    >
                      {shortAddr(row.address)}
                    </a>
                  ) : (
                    <span>Not deployed</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Robinhood Chain market</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.dune?.ok
              ? `${data.dune.stockTickers.toLocaleString()} ERC-20s on Robinhood Chain whose name contains “Robinhood Token”. Zenze lists only the canonical issuer contracts below.`
              : "Stock-token index is not connected. The pair list is the canonical issuer set, with each logo stored once."}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Quote pairs</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Pair</th>
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Chain</th>
                  <th className="px-3 py-2 font-medium">Contract</th>
                </tr>
              </thead>
              <tbody>
                {(data.pairs ?? PAIR_ASSETS).map((p) => {
                  const chain = p.chains[0] as ChainKey;
                  const addr = p.address[chain];
                  const href = addr ? `${CHAINS[chain].explorer}/token/${addr}` : null;
                  const px = data.prices?.[p.key] ?? p.refUsd ?? (p.kind === "stable" || p.key === "usdc" || p.key === "usdg" ? 1 : null);
                  return (
                    <tr key={p.key} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-2 font-medium">
                          <QuoteMark quote={p.key} className="size-5" />${p.symbol}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.name}</td>
                      <td className="px-3 py-2 tabular-nums">{formatUsdMaybe(px ?? null, px != null && px < 1 ? 4 : 2)}</td>
                      <td className="px-3 py-2 capitalize">{p.kind}</td>
                      <td className="px-3 py-2">{p.chains.map((c) => CHAINS[c as ChainKey].short).join(", ")}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-stone hover:text-gold">
                            {shortAddr(addr)}
                          </a>
                        ) : (
                          "Native gas"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold">Recent Zenze pools</h2>
          {data.recent.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No community launches recorded. The $ZNZF curve is live on its own page.</p>
          ) : null}
          <ul className="mt-4 space-y-2">
            {(data.recent as Array<{ id: string; symbol?: string; name?: string; chain?: string; contract_address?: string | null; created_at?: string }>).map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <Link to="/token/$id" params={{ id: tokenRouteId(t) }} className="font-medium hover:underline">
                  ${t.symbol} <span className="text-muted-foreground">{t.name}</span>
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t.chain} · {t.contract_address ? shortAddr(t.contract_address) : "no contract"} · {timeAgo(t.created_at ?? "")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm">
            <Link to="/znzf" className="text-stone underline">
              Open the $ZNZF curve
            </Link>
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function FeeCard({
  label,
  bucket,
  empty,
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
  empty: string;
}) {
  const headline = !bucket.deployed ? "Unavailable" : bucket.usd == null ? "Unpriced" : formatUsd(bucket.usd);
  const note = !bucket.deployed
    ? "Not deployed"
    : bucket.empty
      ? empty
      : `${bucket.native.toLocaleString(undefined, { maximumFractionDigits: bucket.native > 0 && bucket.native < 0.01 ? 8 : 2 })} ETH and ${bucket.pairCount} pair assets`;
  return (
    <div className="bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{headline}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      {bucket.rows.length > 0 ? (
        <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          {bucket.rows.map((row) => (
            <div key={row.symbol} className="flex items-baseline justify-between gap-3">
              <dt>{row.symbol}</dt>
              <dd className="tabular-nums text-muted-foreground">{row.usd == null ? "No reference price" : `$${Math.round(row.usd).toLocaleString("en-US")}`}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
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
  const marks = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].filter(Boolean);
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 font-display text-3xl tabular-nums">{total}</p>
      <p className="text-xs text-muted-foreground">Recent daily context. The latest day is the rightmost bar.</p>
      <div className="mt-4 flex h-36 items-end gap-1">
        {points.map((p, i) => (
          <div key={p.day} className="flex h-full min-w-0 flex-1 items-end" title={`${p.day} ${format(p.value)}`}>
            <div
              className={cn("w-full rounded-t", i === points.length - 1 ? "bg-foreground" : "bg-moss/70")}
              style={{ height: `${p.value <= 0 ? 4 : Math.max(8, (p.value / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        {marks.map((p) => (
          <span key={p.day}>{p.day.slice(5)}</span>
        ))}
      </div>
    </section>
  );
}
