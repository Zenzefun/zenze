import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { openAppKitModalWhenReady } from "@/lib/appkit-bridge";
import { pageHead } from "@/lib/seo";
import { startOnramp } from "@/lib/server/onramp";
import { useWallet } from "@/lib/wallet";

const STEPS = [
  { n: "01", title: "Connect", body: "Tap Wallet. The list that opens is the only way in. Pick the wallet you already use." },
  { n: "02", title: "Buy USDC", body: "The purchase is in dollars. USDC arrives on Arc, in the wallet you just connected." },
  { n: "03", title: "Spend it there", body: "That USDC pays Arc gas. It can finish a bridge. It is not sent to Zenze." },
];

export const Route = createFileRoute("/fund")({
  component: FundPage,
  head: () =>
    pageHead({
      title: "Add USDC",
      description: "Buy USDC on Arc into the wallet you connected. It stays in that wallet and pays Arc gas.",
      path: "/fund",
    }),
});

function FundPage() {
  const wallet = useWallet();
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<object | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!session || !node) return;
    let widget: { close: () => void } | null = null;
    let cancelled = false;
    void import("@circle-fin/onramp-kit").then(({ createOnrampKit }) => {
      if (cancelled || !box.current) return;
      widget = createOnrampKit().mountIframe({
        session,
        container: box.current,
        title: "Buy USDC",
      });
    });
    return () => {
      cancelled = true;
      widget?.close();
      if (node) node.replaceChildren();
    };
  }, [session]);

  async function buy() {
    setBusy(true);
    try {
      if (!wallet.connected) await wallet.connect();
      const address = useWallet.getState().address;
      if (!address) return;
      try {
        await wallet.switchChain("arc");
      } catch {
        // The buy screen still opens on the wallet's current network.
      }
      const res = await startOnramp({ data: { wallet: address } });
      if (res.ok) {
        setSession(res.session);
        return;
      }
      const opened = await openAppKitModalWhenReady("OnRampProviders");
      if (!opened) toast.error("The buy screen is still loading. Try again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the buy screen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-stone">Arc</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">Add USDC</h1>
        <p className="mt-3 max-w-xl text-base text-muted-foreground">
          Buy USDC on Arc into the wallet you connected. The coins stay there. Zenze never holds them and never asks for a seed phrase.
        </p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-2xl border border-border bg-card p-4">
              <p className="font-display text-sm text-stone">{step.n}</p>
              <h2 className="mt-2 font-display text-xl font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-[1.6rem] border border-border bg-card p-4 sm:p-5">
          {session ? null : (
            <Button className="mx-auto flex h-12 w-full max-w-sm" variant="gold" disabled={busy} onClick={() => void buy()}>
              {busy ? "Opening…" : wallet.connected ? "Buy USDC" : "Connect wallet"}
            </Button>
          )}
          <div
            ref={box}
            className={session ? "h-[760px] w-full overflow-hidden rounded-2xl bg-[#071426]" : "hidden"}
          />
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Robinhood trades use ETH. Arc uses USDC.{" "}
          <Link to="/bridge" className="underline underline-offset-2">
            Bridge
          </Link>
          {" · "}
          <Link to="/guide" className="underline underline-offset-2">
            Guide
          </Link>
        </p>
      </article>
    </AppShell>
  );
}
