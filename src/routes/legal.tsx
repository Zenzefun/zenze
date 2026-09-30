import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/legal")({
  component: Legal,
  head: () =>
    pageHead({
      title: "Legal",
      description: "Terms, privacy, and risk disclosure for Zenze.fun.",
      path: "/legal",
    }),
});

function Legal() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Legal</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated 24 September 2026. Not legal advice. Read slowly.</p>

        <h2 className="mt-10 text-2xl font-semibold">What this site is</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Zenze.fun is a non-custodial page for launching a token and trading it on a curve. The contracts run on Robinhood Chain and on Arc. You sign each trade in your own wallet. There is no software download and no account form.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">How to reach this site</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Zenze.fun publishes this page and{" "}
          <a className="underline underline-offset-2" href="https://x.com/ZenzeFun">@ZenzeFun</a>.
          There is no download and no account form.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Terms of Service</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Zenze.fun is a non-custodial interface to smart contracts on Robinhood Chain and Arc. You sign from your own wallet. We do not hold funds, reverse trades, or guarantee token outcomes. By using the app you agree not to use it for market manipulation or sanctions evasion.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Privacy</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Wallet addresses and public on-chain activity are visible by design. We do not sell personal data. Server logs retain IP and user-agent for security. AI prompts are sent to the configured model provider to answer your request and may be cached on the token they describe.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Risk disclosure</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Tokens launched here can go to zero. Bonding curves, health scores, and Capy’s commentary are information, not investment advice. Smart contracts can contain bugs. A move between networks can fail. RPCs can stall. You can lose the entire amount you put in.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">$ZNZF token disclaimer</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          $ZNZF is the protocol token. Minted supply was 1,000,000,000 on Robinhood Chain. Buyback burns reduce that number. The Arc token grows only when canonical tokens are locked. What $ZNZF does today: trade on its curve, lock in the stake contract, vote with the locked balance, and move between the two chains. The curve fee is 2% for every wallet. There is no live fee rebate. The live curve does not migrate. $ZNZF is not equity, a deposit, or a promise of profit.
        </p>
      </article>
    </AppShell>
  );
}
