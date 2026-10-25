import { Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap, Rocket, Sparkles, TrendingUp } from "lucide-react";
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
  const known = tokens.map(tokenVolumeUsd).filter((v): v is number => v != null && Number.isFinite(v));
  const volume = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  const launched = stats?.tokens ?? (tokens.length || null);
  return (
    <section aria-labelledby="home-title" className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-10">
      <div className="min-w-0">
        <Badge variant="gold">Robinhood Chain · Arc</Badge>
        <h1
          id="home-title"
          className="mt-3 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl"
        >
          {SITE.tagline.split(". ")[0]}.{" "}
          <span className="text-gold">{SITE.tagline.split(". ")[1]}</span>
        </h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
          Name a token and its pool opens the moment you launch. Anyone can buy it or sell it back into that same pool, and
          when the curve fills it graduates to Uniswap.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button asChild variant="gold" size="lg" className="h-14 rounded-full px-7 text-base sm:text-lg">
            <Link to="/launch">
              <Rocket aria-hidden className="size-5" />
              Launch a token in 60s
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 rounded-full bg-card/70 px-6">
            <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>
              Buy $ZNZF
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          First time?{" "}
          <Link to="/start" className="font-medium text-gold underline-offset-2 hover:underline">
            Launch your first token in 2 minutes
          </Link>
          : wallet, gas, and the 3 steps.
        </p>
        <HowItWorks />
        <dl className="mt-6 grid max-w-xl grid-cols-3 gap-3">
          <HeroStat label="Tokens" value={launched != null ? Math.round(launched).toLocaleString("en-US") : "—"} />
          <HeroStat
            label="24h volume"
            value={volume != null && volume > 0 ? formatUsdCompact(volume) : volume === 0 ? "$0" : "—"}
          />
          <HeroStat label="$ZNZF price" value={formatUsdTiny(stats?.znzfPriceUsd)} />
        </dl>
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
    <ol aria-label="How it works" className="mt-5 flex max-w-xl flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {STEPS.map((step, i) => (
        <li key={step.title} className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5">
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

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stone-card min-w-0 rounded-xl px-3 py-2.5">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-base break-all tabular-nums sm:text-xl sm:break-normal sm:whitespace-nowrap">
        {value}
      </dd>
    </div>
  );
}
