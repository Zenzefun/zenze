import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { ChainMark } from "@/components/chains/chain-mark";
import { AppShell } from "@/components/layout/app-shell";
import { SmartImage, TokenImage } from "@/components/media/smart-image";
import { Button } from "@/components/ui/button";
import { CHAINS, type ChainKey } from "@/lib/chains";
import { bridgeLockCalldata, bridgeTransferId, erc20ApproveCalldata } from "@/lib/contracts";
import { floorDecimal, formatAmount } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { completeBridge, bridgeSnapshot } from "@/lib/server/bridge";
import { protocolStats } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { publicWalletError, useWallet } from "@/lib/wallet";
import { ZNZF_IPFS_GATEWAY } from "@/lib/znzf-image";

export const Route = createFileRoute("/bridge")({
  loader: () => bridgeSnapshot({ data: {} }),
  component: Bridge,
  head: () =>
    pageHead({
      title: "Bridge",
      description: "The same $ZNZF on the other network. Lock some here, the same amount shows up there. Nothing extra is created.",
      path: "/bridge",
    }),
});

type Step = "idle" | "approve" | "lock" | "complete" | "done";

function Bridge() {
  const loaded = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const wallet = useWallet();
  const snap = useQuery({
    queryKey: ["bridge-snap", wallet.address ?? ""],
    queryFn: () => bridgeSnapshot({ data: { wallet: wallet.address } }),
    initialData: loaded,
    refetchInterval: 12_000,
  });
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<ChainKey>("robinhood");
  const [step, setStep] = useState<Step>("idle");
  const [lockTx, setLockTx] = useState<string | null>(null);
  const [mintTx, setMintTx] = useState<string | null>(null);
  const [receiveChain, setReceiveChain] = useState<ChainKey | null>(null);
  const n = Number(amount) || 0;
  const to: ChainKey = from === "robinhood" ? "arc" : "robinhood";
  const live = Boolean(snap.data?.live);
  const token = from === "arc" ? snap.data?.znzf_arc : snap.data?.znzf_robinhood;
  const bridge = from === "arc" ? snap.data?.bridge_arc : snap.data?.bridge_robinhood;
  const bal = from === "arc" ? (snap.data?.arc ?? 0) : (snap.data?.robinhood ?? 0);
  const pending = snap.data?.pending ?? null;
  const destReady = to === "arc" ? snap.data?.gasArc !== false : snap.data?.gasRobinhood !== false;
  const finishing = Boolean(lockTx || pending);

  const percents = useMemo(() => [25, 50, 75, 100] as const, []);

  function fillPct(pct: number) {
    const cap = bal * (pct / 100);
    setAmount(cap > 0 ? floorDecimal(cap, 6) : "");
  }

  function flip() {
    setFrom(to);
    setLockTx(null);
    setMintTx(null);
    setStep("idle");
  }

  const run = useMutation({
    mutationFn: async () => {
      const saved = lockTx ?? pending?.lockTx ?? "";
      const savedFrom = lockTx ? from : (pending?.from ?? from);
      if (saved) {
        setStep("complete");
        const done = await completeBridge({ data: { chain: savedFrom, txHash: saved } });
        if (!done.ok) throw new Error(done.error);
        const landed: ChainKey = savedFrom === "robinhood" ? "arc" : "robinhood";
        setReceiveChain(landed);
        setMintTx(done.mintTx);
        setStep("done");
        return { ...done, landed };
      }
      if (!wallet.connected) await wallet.connect();
      if (!isHexAddress(token) || !isHexAddress(bridge)) throw new Error("This move is not open yet.");
      if (n <= 0) throw new Error("Enter an amount greater than zero.");
      if (n > bal) throw new Error("That is more than this wallet holds.");
      const ready = to === "arc" ? snap.data?.gasArc : snap.data?.gasRobinhood;
      if (ready === false) {
        const gas = CHAINS[to].gas;
        throw new Error(`${CHAINS[to].name} cannot receive yet. The bridge wallet needs a little ${gas} first. Nothing has been locked.`);
      }
      if (wallet.chainId !== CHAINS[from].id) await wallet.switchChain(from);
      const clean = amount.trim().replace(/\.$/, "");
      const wei = parseUnits(clean || "0", 18);
      if (wei <= 0n) throw new Error("Enter an amount greater than zero.");
      const id = bridgeTransferId(wallet.address ?? "0x0000000000000000000000000000000000000000", wei, Date.now());
      setStep("approve");
      const approveHash = await wallet.sendTransaction({
        to: token,
        data: erc20ApproveCalldata(bridge, wei),
      });
      const approved = await wallet.waitReceipt(approveHash);
      if (approved.status !== "success") throw new Error("Approval reverted.");
      setStep("lock");
      const hash = await wallet.sendTransaction({
        to: bridge,
        data: bridgeLockCalldata(wei, CHAINS[to].id, id),
      });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("Bridge transaction reverted.");
      setLockTx(hash);
      setStep("complete");
      const done = await completeBridge({ data: { chain: from, txHash: hash } });
      if (!done.ok) throw new Error(done.error);
      const landed: ChainKey = to;
      setReceiveChain(landed);
      setMintTx(done.mintTx);
      setStep("done");
      return { ...done, landed };
    },
    onSuccess: (done) => {
      const landed = done.landed;
      toast.success(`Received ${formatAmount(n || pending?.amount || 0, 4)} $ZNZF on ${CHAINS[landed].name}.`);
      setLockTx(null);
      void snap.refetch();
    },
    onError: (err) => {
      toast.error(publicWalletError(err));
      setStep(lockTx || pending ? "complete" : "idle");
    },
  });

  const cta = !live
    ? "Not open yet"
    : finishing
      ? step === "complete" && run.isPending
        ? `Receiving on ${CHAINS[pending?.to ?? to].short}…`
        : "Finish this move"
      : !wallet.connected
        ? "Connect wallet"
        : !destReady
          ? `${CHAINS[to].short} needs gas`
          : n <= 0
            ? "Enter an amount"
            : step === "approve"
              ? "Approve $ZNZF…"
              : step === "lock"
                ? `Sending on ${CHAINS[from].short}…`
                : `Bridge to ${CHAINS[to].short}`;

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Bridge</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {live
            ? "The same coin on the other network. Lock some here and the same amount shows up there. Nothing extra is created."
            : "This bridge is not open yet."}
        </p>
        {(snap.data?.legacy ?? 0) > 0 && (
          <LegacyReturn
            amount={snap.data?.legacy ?? 0}
            token={snap.data?.legacy_arc_token ?? ""}
            bridge={snap.data?.legacy_arc_bridge ?? ""}
          />
        )}
        <div className="mt-6 overflow-hidden rounded-2xl">
          <SmartImage
            src="/brand/onsen-landscape.webp"
            alt="Capy resting in a quiet onsen"
            width={1200}
            height={675}
            className="h-40 w-full object-cover sm:h-48"
            rounded="none"
          />
        </div>

        <div className="mt-6 space-y-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>From</span>
              <span className="tabular-nums">{formatAmount(bal, 4)} $ZNZF</span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <label className="sr-only" htmlFor="bridge-amount">Amount to bridge</label>
              <input
                id="bridge-amount"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50 focus-visible:outline-none"
              />
              <ChainChip chain={from} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
                <TokenImage src={ZNZF_IPFS_GATEWAY} size={18} className="size-4.5" />
                <span className="text-sm font-semibold">$ZNZF</span>
              </div>
              <div className="flex gap-1">
                {percents.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => fillPct(p)}
                    className="h-11 min-w-11 rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {p === 100 ? "Max" : `${p}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={flip}
              disabled={finishing}
              className="flex size-11 items-center justify-center rounded-full border border-border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              aria-label="Switch direction"
            >
              <ArrowDownUp className="size-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">To</p>
            <div className="mt-2 flex items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-3xl font-semibold tabular-nums">{n > 0 ? formatAmount(n, 6) : "0"}</p>
              <ChainChip chain={to} />
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 w-fit">
              <TokenImage src={ZNZF_IPFS_GATEWAY} size={18} className="size-4.5" />
              <span className="text-sm font-semibold">$ZNZF</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>You receive</span>
            <span>1:1 · ~1 min · no extra fee</span>
          </div>

          {!destReady && !finishing ? (
            <p className="px-1 text-sm text-muted-foreground">
              A move onto Arc waits until the bridge wallet has USDC for gas.{" "}
              <Link to="/fund" className="underline underline-offset-2">
                Add USDC
              </Link>{" "}
              fills the wallet you connect, which is what you spend on Arc.
            </p>
          ) : null}

          {finishing ? (
            <p className="px-1 text-sm text-muted-foreground">
              {formatAmount(pending?.amount || n, 4)} $ZNZF is locked
              {snap.data?.gasWallet ? ` . Finish pays out from ${snap.data.gasWallet.slice(0, 6)}…${snap.data.gasWallet.slice(-4)} once that wallet has ${CHAINS[pending?.to ?? to].gas} for gas.` : "."}
            </p>
          ) : null}

          <Button
            className="h-12 w-full"
            variant="gold"
            disabled={!live || run.isPending || (!finishing && wallet.connected && (n <= 0 || !destReady))}
            onClick={() => run.mutate()}
          >
            {cta}
          </Button>
        </div>

        {(lockTx || mintTx) && (
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            {lockTx && (
              <p>
                Sent{" "}
                <a className="underline underline-offset-2" href={`${CHAINS[pending?.from ?? from].explorer}/tx/${lockTx}`} target="_blank" rel="noreferrer">
                  {lockTx.slice(0, 10)}…
                </a>
              </p>
            )}
            {mintTx && (
              <p>
                Received{" "}
                <a className="underline underline-offset-2" href={`${CHAINS[receiveChain ?? pending?.to ?? to].explorer}/tx/${mintTx}`} target="_blank" rel="noreferrer">
                  {mintTx.slice(0, 10)}…
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function LegacyReturn({
  amount,
  token,
  bridge,
}: {
  amount: number;
  token: string;
  bridge: string;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  async function sendHome() {
    if (!isHexAddress(token) || !isHexAddress(bridge)) return;
    setBusy(true);
    try {
      if (!wallet.connected) await wallet.connect();
      if (wallet.chainId !== CHAINS.arc.id) await wallet.switchChain("arc");
      const wei = parseUnits(String(amount), 18);
      const id = bridgeTransferId(wallet.address ?? "0x0000000000000000000000000000000000000000", wei, Date.now());
      const approveHash = await wallet.sendTransaction({ to: token, data: erc20ApproveCalldata(bridge, wei) });
      const approved = await wallet.waitReceipt(approveHash);
      if (approved.status !== "success") throw new Error("Approval reverted.");
      const lockHash = await wallet.sendTransaction({ to: bridge, data: bridgeLockCalldata(wei, CHAINS.robinhood.id, id) });
      const locked = await wallet.waitReceipt(lockHash);
      if (locked.status !== "success") throw new Error("Return lock reverted.");
      const done = await completeBridge({ data: { chain: "arc", txHash: lockHash } });
      if (!done.ok) throw new Error(done.error);
      toast.success("Old Arc tokens are back on Robinhood. Use the form above if you want them on Arc again.");
    } catch (err) {
      toast.error(publicWalletError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm">
      <p className="font-medium">Previous Arc token</p>
      <p className="mt-1 text-muted-foreground">
        This wallet holds {formatAmount(amount, 4)} on the previous Arc contract. Sending it home burns that balance and returns the same canonical $ZNZF. It does not mint a second supply.
      </p>
      <Button type="button" variant="outline" className="mt-3" disabled={busy} onClick={() => void sendHome()}>
        {busy ? "Returning…" : "Send the old balance home"}
      </Button>
    </div>
  );
}

function ChainChip({ chain }: { chain: ChainKey }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5">
      <ChainMark chain={chain} className="size-4" />
      <span className="text-sm font-semibold">{CHAINS[chain].short}</span>
    </div>
  );
}
