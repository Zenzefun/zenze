import { Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap, Lock, Rocket, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { tokenBoardKind } from "@/lib/pool";
import { ZnzfHero } from "@/components/capy/znzf-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUsdCompact, formatUsdTiny } from "@/lib/format";
import { tokenVolumeUsd } from "@/lib/token-volume";
import { SITE } from "@/lib/seo";
import { znzfLaunchpadId } from "@/lib/token-path";
import type { EnrichedToken } from "@/lib/server/market";

type Stats = { tokens?: number | null; znzfPriceUsd?: number | null } | null | undefined;

/**
 * Front door: what Zenzen is, what to do, and three live numbers. Same warm stage as /znzf.
 * 24h volume is the sum of the board rows (same figures the rows show). protocolStats().volumeUsd
 * adds synced Uniswap swaps on top of the pool's own 24h volume, so it double counts listed tokens.
 */
export function HomeHero({ stats, tokens }: { stats: Stats; tokens: EnrichedToken[] }) {
  // Only tokens launched on Zenzen count here. Listed Uniswap tokens (tokenBoardKind "listed") are tradable on the
  // board but were not launched by Zenzen creators, so they stay out of these numbers.
  const own = tokens.filter((t) => tokenBoardKind(t) !== "listed" && tokenBoardKind(t) !== "protocol");
  const listedCount = tokens.filter((t) => tokenBoardKind(t) === "listed").length;
  const known = own.map(tokenVolumeUsd).filter((v): v is number => v != null && Number.isFinite(v));
  const volume = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  const launched = own.length;
  const latest = [...own].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
  const [lead, rest] = SITE.tagline.split(". ");
  return (
    <section aria-labelledby="home-title" className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-12">
      <div className="min-w-0">
        <Badge variant="gold">Robinhood Chain · Arc</Badge>
        <h1 id="home-title" className="hero-title mt-3 text-3xl font-semibold sm:text-5xl">
          {lead}.
          {rest ? (
            <>
              <br />
              {rest}
            </>
          ) : null}
        </h1>
        <p className="mt-3 max-w-[680px] text-base text-pretty text-muted-foreground sm:text-lg">
          Your token, live in about two minutes. Anyone can trade it the moment it launches, no listing and no waiting.
        </p>
        <div className="mt-6">
          <Button asChild variant="gold" size="lg" className="rounded-full">
            <Link to="/launch">
              <Rocket aria-hidden className="size-5" />
              Launch a token
            </Link>
          </Button>
        </div>
        <ul aria-label="Why it is safe to try" className="mt-3 flex max-w-[680px] flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><Lock className="size-3.5 text-signal" aria-hidden />Non-custodial. Your wallet signs everything</li>
          <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-signal" aria-hidden /><a href="#trust-title" className="underline-offset-2 hover:underline">Verified contracts, public code</a></li>
          <li>Live on Robinhood Chain · Built on Arc</li>
        </ul>
        <p className="mt-3 max-w-[680px] text-sm text-pretty text-muted-foreground">
          First launch?{" "}
          <Link to="/start" className="font-semibold text-foreground underline-offset-2 hover:underline">
            Wallet, gas, and the 3 steps.
          </Link>
        </p>
        <HowItWorks />
        <div className="mt-6 grid max-w-xl grid-cols-3 gap-3">
          <HeroStat label="Launches" value={launched != null ? Math.round(launched).toLocaleString("en-US") : "—"} />
          {volume != null && volume > 0 ? (
            <HeroStat label="24h volume" value={formatUsdCompact(volume)} />
          ) : (
            <HeroStat label="Latest launch" value={latest ? `$${latest.symbol}` : "—"} to={latest?.id} />
          )}
          <HeroStat label="$ZNZF" value="Buy $ZNZF" buy />
        </div>
        <p className="mt-3 max-w-[680px] text-xs text-pretty text-muted-foreground">
          Counts only tokens launched on Zenzen{listedCount > 0 ? `. ${listedCount} listed Uniswap token${listedCount === 1 ? " is" : "s are"} tradable on the board but not counted` : ""}. A launch does not promise buyers.
        </p>
      </div>
      <div className="relative mx-auto hidden w-full max-w-[300px] lg:block">
        <ZnzfHero />
      </div>
    </section>
  );
}

const STEPS = [
  { icon: Sparkles, title: "Create", detail: "Name, ticker, image" },
  { icon: TrendingUp, title: "Trade", detail: "The pool opens at launch" },
  { icon: GraduationCap, title: "Graduate", detail: "Full curve moves to Uniswap" },
] as const;

/** Create → Trade → Graduate, the whole lifecycle in one line. */
function HowItWorks() {
  return (
    <ol aria-label="How it works" className="mt-6 flex max-w-[680px] flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
            <step.icon className="size-4 text-gold" aria-hidden />
            <span className="font-medium">{step.title}</span>
            <span className="hidden text-muted-foreground sm:inline">· {step.detail}</span>
          </span>
          {i < STEPS.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function HeroStat({ label, value, buy = false, to }: { label: string; value: string; buy?: boolean; to?: string }) {
  const body = (
    <>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-base tabular-nums sm:text-xl">{value}</p>
    </>
  );
  const className = "stone-card block min-w-0 rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (!buy && !to) return <div className={className}>{body}</div>;
  return (
    <Link to="/token/$id" params={{ id: to ?? znzfLaunchpadId() }} className={className} aria-label={buy ? "Buy $ZNZF" : `${label}: ${value}`}>
      {body}
    </Link>
  );
}
