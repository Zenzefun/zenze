import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLockup, CapyMark } from "@/components/capy/capy-mark";
import { QuietNotFound } from "@/components/not-found";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/format";
import { TREASURY_WALLET } from "@/lib/onchain";
import { clearOperatorSession, readOperatorSession, writeOperatorSession, type OperatorSession } from "@/lib/operator-session";
import { pageHead } from "@/lib/seo";
import { adminOverview, getOperator } from "@/lib/server/admin";
import { endOperatorSession, startOperatorSession } from "@/lib/server/operator";
import { probeDesk } from "@/lib/stealth-status";
import { beginDeskConnect, installWalletErrorGuard, publicWalletError, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/arise")({
  loader: async () => probeDesk(),
  notFoundComponent: QuietNotFound,
  component: AriseGate,
  headers: () => ({
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
  }),
  head: () =>
    pageHead({
      title: undefined,
      description: "Zenze.fun",
      path: "/",
      index: false,
    }),
});

const LINKS = [
  { to: "/arise", label: "Overview", exact: true },
  { to: "/arise/ai", label: "Flash" },
  { to: "/arise/tokens", label: "Tokens" },
  { to: "/arise/listings", label: "Listings" },
  { to: "/arise/treasury", label: "Treasury" },
  { to: "/arise/airdrop", label: "Drop" },
  { to: "/arise/marketing", label: "Marketing" },
  { to: "/arise/users", label: "Operators" },
  { to: "/arise/settings", label: "Settings" },
] as const;

function AriseGate() {
  const gate = Route.useLoaderData();
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(readOperatorSession());
    setReady(true);
  }, []);

  const op = useQuery({
    queryKey: ["operator", session?.wallet ?? "cookie"],
    queryFn: () => getOperator(),
    enabled: ready && Boolean(session || gate?.signedIn),
    retry: false,
  });

  const awaitingSession = Boolean(session || gate?.signedIn);
  if (awaitingSession && (!ready || (op.isPending && !op.isError))) {
    return (
      <main className="relative z-0 grid min-h-screen place-items-center bg-background px-4 text-center">
        <div>
          <CapyMark className="mx-auto size-16 capy-bob" />
          <p className="mt-6 text-sm text-muted-foreground">Opening the desk…</p>
        </div>
      </main>
    );
  }
  if (op.isError || !op.data?.wallet) {
    return (
      <DeskGate
        onSigned={(next) => {
          setSession(next);
          void op.refetch();
        }}
        hint={session && op.isError ? "That session expired. Sign again with the treasury wallet." : undefined}
      />
    );
  }

  return (
    <div className="relative z-0 flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 border-r border-border p-4 md:block">
        <Link to="/" className="flex items-center gap-2">
          <BrandLockup markClassName="size-8" wordmarkClassName="text-base" />
        </Link>
        <p className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">{op.data.role.replace("_", " ")}</p>
        <nav className="mt-4 flex flex-col gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              activeOptions={l.to === "/arise" ? { exact: true } : undefined}
              activeProps={{ className: "rounded-md bg-muted px-3 py-2 text-sm text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-3 md:hidden">
            <CapyMark className="size-7" />
            <span className="text-sm font-medium">Desk</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <DeskCount />
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{formatAddress(op.data.wallet)}</span>
            <ThemeToggle />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                clearOperatorSession();
                void endOperatorSession().finally(() => {
                  window.location.href = "/arise";
                });
              }}
            >
              Sign out
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border px-2 py-2 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="shrink-0 rounded-full px-3 py-1.5 text-sm hover:bg-muted">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-x-hidden px-4 py-8 md:px-8 md:py-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function DeskGate({
  onSigned,
  hint,
}: {
  onSigned: (session: OperatorSession) => void;
  hint?: string;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(hint ?? null);

  useEffect(() => {
    installWalletErrorGuard();
    void wallet.init();
  }, [wallet.init]);

  async function continueDesk() {
    setBusy(true);
    setError(null);
    try {
      if (!wallet.connected) {
        beginDeskConnect();
        await wallet.connect();
      }
      const signed = await wallet.signIntent({ action: "admin", tokenId: "desk" });
      const res = await startOperatorSession({ data: signed });
      if (!res.ok) {
        clearOperatorSession();
        void endOperatorSession();
        setError(res.error ?? "This wallet cannot open the desk. Use the treasury wallet.");
        return;
      }
      writeOperatorSession(signed);
      onSigned(signed);
    } catch (err) {
      clearOperatorSession();
      void endOperatorSession();
      setError(publicWalletError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative z-0 grid min-h-screen place-items-center bg-background px-4 text-center">
      <div className="max-w-sm page-enter">
        <CapyMark className="mx-auto size-20" />
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-stone">Operator desk</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">Sign in to continue</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The desk opens for the treasury wallet {formatAddress(TREASURY_WALLET)}. Another wallet is refused.
        </p>
        <div className="mt-8 space-y-3">
          {wallet.connected && wallet.address ? (
            <p className="text-xs text-muted-foreground">Connected {formatAddress(wallet.address)}.</p>
          ) : null}
          <Button className="w-full" variant="gold" disabled={busy} onClick={() => void continueDesk()}>
            {busy ? "Waiting for signature…" : wallet.connected ? "Sign with wallet" : "Connect & sign"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}

function DeskCount() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminOverview(), retry: false });
  if (!q.data || !q.data.ok) return null;
  return <span className="text-xs tabular-nums text-muted-foreground">{q.data.tokens} tokens</span>;
}
