import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/legal")({
  component: Legal,
  head: () =>
    pageHead({
      title: "Legal",
      description: "Terms, privacy, and risk disclosure for Zenzen.",
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
          Zenzen is a noncustodial interface. It does not hold your assets, it does not send or undo a trade, and it is not a bank, broker, exchange, custodian, or adviser. Nothing on this site is financial, legal, or tax advice. A token launched here is issued by its creator, not by Zenzen. It can fall to zero, and it can have no buyer. A listing or a rank is not an endorsement. You choose the trade, you hold the wallet, and you follow the law where you are. Zenzen is not Robinhood Markets and not Circle.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">How to reach this site</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Zenzen publishes this page and{" "}
          <a className="underline underline-offset-2" href="https://x.com/ZenzeFun">@ZenzeFun</a>.
          There is no download and no account form.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Terms of Service</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Zenzen is a non-custodial interface to smart contracts on Robinhood Chain and Arc. You sign from your own wallet. We do not hold funds, reverse trades, or guarantee token outcomes. By using the app you agree not to use it for market manipulation or sanctions evasion.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Privacy</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Wallet addresses and public on-chain activity are visible by design. We do not sell personal data. Server logs retain IP and user-agent for security. A question you type on Capy AI is sent to the model so it can answer, and the read can be saved on that token.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Risk disclosure</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Tokens launched here can go to zero. A bonding curve and a health label are information, not investment advice. Smart contracts can contain bugs. A move between networks can fail. You can lose the entire amount you put in.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">$ZNZF token disclaimer</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          $ZNZF is the protocol token. Minted supply was 1,000,000,000 on Robinhood Chain. Buyback burns reduce that number. The Arc token grows only when canonical tokens are locked. What $ZNZF does today: trade on its curve, lock in the stake contract, vote with the locked balance, and move between the two chains. The curve fee is 2% for every wallet. There is no live fee rebate. The live curve does not migrate. $ZNZF is not equity, a deposit, or a promise of profit.
        </p>
      </article>
    </AppShell>
  );
}
