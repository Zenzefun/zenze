import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/start")({
  component: Start,
  head: () =>
    pageHead({
      title: "Launch your first token in 2 minutes",
      description: "A beginner guide: get a wallet, get a little gas, then launch your token in 3 steps.",
      path: "/start",
    }),
});

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-gold underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

function Step({ n, title, children, id }: { n: number; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="stone-card mt-6 scroll-mt-24 rounded-xl p-5">
      <h2 className="flex items-center gap-3 text-xl font-semibold">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold text-sm font-bold text-black">{n}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Start() {
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Launch your first token in 2 minutes</h1>
        <p className="mt-2 text-muted-foreground">
          Never done this before? No problem. You need two things: a wallet, and a little gas to pay the network. Then it's 3 short
          steps.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          The 2 minutes is the launch itself. Getting gas the first time can take longer, depending on where your crypto is now.
        </p>

        <Step n={1} title="Get a wallet">
          <p>A wallet is an app that holds your crypto and signs for you. Pick one and install it:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <Ext href="https://metamask.io/download">MetaMask</Ext> (browser extension or phone app)
            </li>
            <li>
              <Ext href="https://rabby.io">Rabby</Ext> (browser extension)
            </li>
            <li>Robinhood Wallet (phone app; supports Robinhood Chain out of the box)</li>
          </ul>
          <p>
            Your wallet shows you a list of backup words when you set it up. Write them on paper and never share them. <strong className="text-foreground">Nobody from Zenze will ever ask for them.</strong>
          </p>
        </Step>

        <Step n={2} title="Connect and pick a network">
          <p>
            Tap <strong className="text-foreground">Wallet</strong> at the top of this site and approve the connection. Then pick
            Robinhood Chain or Arc.
          </p>
          <p>You don't need to add the network by hand. If your wallet doesn't have it yet, it will ask you to add it. Just approve.</p>
        </Step>

        <Step n={3} title="Get a little gas" id="gas">
          <p>
            Gas is the small network fee every transaction pays. Each network uses a different coin for it:
          </p>
          <div className="rounded-lg border border-border p-4">
            <p className="font-medium text-foreground">Robinhood Chain uses ETH</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Have ETH on Ethereum? Move it with the official{" "}
                <Ext href="https://portal.arbitrum.io/bridge?destinationChain=robinhood-chain&sourceChain=ethereum">Arbitrum bridge</Ext>{" "}
                (Ethereum → Robinhood Chain, usually about 10 minutes).
              </li>
              <li>
                Faster routes from other networks (Relay, LayerZero/Stargate, LiFi and more) are listed in the{" "}
                <Ext href="https://docs.robinhood.com/chain/bridging/">Robinhood Chain bridging docs</Ext>.
              </li>
            </ul>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="font-medium text-foreground">Arc uses USDC</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Buy USDC straight into your wallet on our{" "}
                <Link to="/fund" className="font-medium text-gold underline-offset-2 hover:underline">
                  Add USDC
                </Link>{" "}
                page. It stays in your wallet.
              </li>
              <li>
                Already have USDC on another network? Move it to Arc with a bridge that supports Circle CCTP (see{" "}
                <Ext href="https://docs.arc.io/integrate/infrastructure/bridges">Arc bridge docs</Ext>).
              </li>
            </ul>
          </div>
          <p>Only bridge from links you trust. Double-check the website address before you sign anything.</p>
        </Step>

        <Step n={4} title="Launch in 3 steps">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Name</strong>: pick a name and a short ticker. Add a picture, or use the default one.
            </li>
            <li>
              <strong className="text-foreground">Describe</strong>: say what it's about. The Generate button can write a draft for you.
            </li>
            <li>
              <strong className="text-foreground">Deploy</strong>: pick the network, tap Deploy, and approve in your wallet.
            </li>
          </ol>
          <p>Skip the Advanced section. The defaults are fine for a first launch.</p>
          <p>When it's live, share it on X so people can find it.</p>
          <Button asChild variant="gold" size="lg" className="mt-2 rounded-full">
            <Link to="/launch">Start my token</Link>
          </Button>
        </Step>

        <section className="mt-8 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Stuck?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>"Not enough gas": add a bit more ETH or USDC (step 3), then try again.</li>
            <li>"Different network": your wallet will ask to switch. Approve it.</li>
            <li>"You cancelled it": nothing was sent. Tap the button again.</li>
            <li>
              Still stuck? Ask on <Ext href="https://t.me/zenzefun">Telegram</Ext>.
            </li>
          </ul>
          <p className="mt-4 text-xs">Launching a token doesn't guarantee anyone buys it. Only spend what you're comfortable with.</p>
        </section>
      </article>
    </AppShell>
  );
}
