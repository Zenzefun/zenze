import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { AppShell } from "@/components/layout/app-shell";
import { TokenImage } from "@/components/media/smart-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddZnzfToWallet } from "@/components/wallet/add-token";
import { CHAINS } from "@/lib/chains";
import { erc20ApproveCalldata, stakeCalldata, unstakeCalldata, claimStakeCalldata } from "@/lib/contracts";
import { floorDecimal, formatCompact, formatUsdMaybe } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { publishedConfig } from "@/lib/onchain";
import { protocolStats, stakingPage } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { znzfLaunchpadId } from "@/lib/token-path";
import { ZNZF_IPFS_GATEWAY } from "@/lib/znzf-image";
import { publicWalletError, useWallet } from "@/lib/wallet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/staking")({
  loader: () => stakingPage({ data: {} }),
  component: Staking,
  head: () =>
    pageHead({
      title: "Stake $ZNZF",
      description:
        "Lock $ZNZF and your vote counts. You can take it back. The reward is the $ZNZF the treasury already put in.",
      path: "/staking",
    }),
});

const PRESETS = [0.25, 0.5, 0.75, 1] as const;
const TOKEN_NAME = "Zenze";

function Staking() {
  const loaded = Route.useLoaderData();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats(), refetchInterval: 15_000 });
  const wallet = useWallet();
  const page = useQuery({
    queryKey: ["staking", wallet.address],
    queryFn: () => stakingPage({ data: { wallet: wallet.address ?? undefined } }),
    initialData: loaded,
    refetchInterval: 10_000,
  });
  const [amt, setAmt] = useState("");
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const n = Number(amt.replace(/,/g, "")) || 0;
  const d = page.data;
  const price = d?.znzfPriceUsd ?? stats.data?.znzfPriceUsd ?? null;
  const yourStake = d?.yourStake ?? 0;
  const onchain = d?.onchainZnzf ?? 0;
  const cfg = publishedConfig();
  const stakeTo = cfg.stake_robinhood?.startsWith("0x") ? cfg.stake_robinhood : "";
  const robinhood = cfg.znzf_robinhood?.startsWith("0x") ? cfg.znzf_robinhood : null;
  const arc = cfg.znzf_arc?.startsWith("0x") ? cfg.znzf_arc : null;
  const locked = isHexAddress(stakeTo);
  const room = locked ? Math.max(0, onchain) : Math.max(0, onchain - yourStake);
  const liveWeight = d?.liveWeight ?? Math.min(yourStake, onchain);
  const cap = mode === "stake" ? room : yourStake;
  const over = n > 0 && n > cap + 1e-12;
  const ends = d?.rewardEnds ? new Date(d.rewardEnds) : null;
  const endsLabel = ends && !Number.isNaN(ends.getTime()) ? ends.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  const paying = (d?.rewardLeft ?? 0) > 0;
  const ready = n > 0 && !over;

  const stake = useMutation({
    mutationFn: async (kind: "stake" | "unstake") => {
      if (!locked || !robinhood) throw new Error("The stake contract is not published yet.");
      if (!wallet.connected) await wallet.connect();
      if (wallet.chainId !== CHAINS.robinhood.id) await wallet.switchChain("robinhood");
      const clean = floorDecimal(n, 6);
      const wei = parseUnits(clean, 18);
      if (kind === "stake") {
        const approveHash = await wallet.sendTransaction({ to: robinhood, data: erc20ApproveCalldata(stakeTo, wei) });
        const approved = await wallet.waitReceipt(approveHash);
        if (approved.status !== "success") throw new Error("Approval reverted.");
        const hash = await wallet.sendTransaction({ to: stakeTo, data: stakeCalldata(wei) });
        const receipt = await wallet.waitReceipt(hash);
        if (receipt.status !== "success") throw new Error("Stake reverted.");
        return hash;
      }
      const hash = await wallet.sendTransaction({ to: stakeTo, data: unstakeCalldata(wei) });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("Unstake reverted.");
      return hash;
    },
    onSuccess: async (_res, kind) => {
      toast.success(kind === "stake" ? "Locked in the stake contract." : "Unlocked. $ZNZF is back in this wallet.");
      setAmt("");
      await Promise.all([page.refetch(), stats.refetch()]);
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  const helper = useMemo(() => {
    if (!wallet.connected) return locked
      ? "Connect a wallet. Staking locks $ZNZF in the contract on Robinhood Chain."
      : "The stake contract is not published yet.";
    if (mode === "stake" && onchain <= 0) return "This wallet holds no $ZNZF on Robinhood Chain yet.";
    if (mode === "stake" && room <= 0) return "This wallet has no unlocked $ZNZF left to lock.";
    if (mode === "unstake" && yourStake <= 0) return "Nothing is staked on this wallet.";
    if (over) {
      return mode === "stake"
        ? `Max you can stake is ${formatCompact(room)} $ZNZF.`
        : `Max you can unstake is ${formatCompact(yourStake)} $ZNZF.`;
    }
    if (n <= 0) {
      return mode === "stake" ? `Room to stake ${formatCompact(room)} $ZNZF.` : `Staked ${formatCompact(yourStake)} $ZNZF.`;
    }
    return null;
  }, [wallet.connected, mode, onchain, room, yourStake, over, n]);

  function setPct(p: number) {
    const base = cap * p;
    if (!(base > 0)) {
      setAmt("");
      return;
    }
    setAmt(trimAmt(base));
  }

  async function onPrimary() {
    if (!wallet.connected) {
      await wallet.connect();
      return;
    }
    if (!ready) return;
    stake.mutate(mode);
  }

  const actionLabel = !wallet.connected
    ? "Connect wallet"
    : !locked
      ? "Stake contract pending"
      : stake.isPending
        ? "Confirm in wallet…"
        : mode === "stake"
          ? "Lock $ZNZF"
          : "Unlock $ZNZF";

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-muted-foreground">
          <Link to="/znzf" className="hover:underline">
            $ZNZF
          </Link>{" "}
          · Stake
        </p>

        <div className="mt-5 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <TokenImage
            src={ZNZF_IPFS_GATEWAY}
            alt={TOKEN_NAME}
            size={96}
            priority
            protocol
            seed="znzf"
            className="ring-2 ring-gold/50 ring-offset-2 ring-offset-background"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-semibold sm:text-4xl">Stake $ZNZF</h1>
              <Badge variant="gold">{TOKEN_NAME}</Badge>
            </div>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Lock $ZNZF and your vote counts. You can take it back. The reward is only the $ZNZF the treasury has already funded.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/governance">Governance</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/znzf">$ZNZF protocol</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>
                  Buy $ZNZF
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Total staked"
            value={formatCompact(d?.totalStaked ?? 0)}
            note={formatUsdMaybe(price != null ? (d?.totalStaked ?? 0) * price : null)}
          />
          <Stat
            label="Still to pay"
            value={formatCompact(d?.rewardLeft ?? 0)}
            note={paying ? `${formatCompact(d?.rewardPerDay ?? 0)} a day until ${endsLabel}` : "The funded reward has finished"}
          />
          <Stat
            label="Your stake"
            value={wallet.connected ? formatCompact(yourStake) : "—"}
            note={wallet.connected ? formatUsdMaybe(price != null ? yourStake * price : null) : "Connect wallet"}
          />
          <Stat
            label="Voting power"
            value={wallet.connected ? formatCompact(liveWeight) : "—"}
            note="Same as what this wallet has locked"
          />
        </dl>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="stone-card rounded-2xl p-5 sm:p-6">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v === "unstake" ? "unstake" : "stake");
                setAmt("");
              }}
            >
              <TabsList className="grid h-12 w-full grid-cols-2 rounded-xl p-1">
                <TabsTrigger value="stake" className="h-10 rounded-lg text-sm">
                  Stake
                </TabsTrigger>
                <TabsTrigger value="unstake" className="h-10 rounded-lg text-sm">
                  Unstake
                </TabsTrigger>
              </TabsList>
              <TabsContent value="stake" className="mt-5">
                <StakeForm
                  amt={amt}
                  setAmt={setAmt}
                  cap={room}
                  connected={wallet.connected}
                  helper={helper}
                  ready={ready}
                  pending={stake.isPending}
                  over={over}
                  actionLabel={actionLabel}
                  onAction={() => void onPrimary()}
                  onPreset={setPct}
                  variant="gold"
                />
              </TabsContent>
              <TabsContent value="unstake" className="mt-5">
                <StakeForm
                  amt={amt}
                  setAmt={setAmt}
                  cap={yourStake}
                  connected={wallet.connected}
                  helper={helper}
                  ready={ready}
                  pending={stake.isPending}
                  over={over}
                  actionLabel={actionLabel}
                  onAction={() => void onPrimary()}
                  onPreset={setPct}
                  variant="outline"
                />
              </TabsContent>
            </Tabs>
            {(d?.earned ?? 0) > 0 && (
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-11 w-full rounded-xl"
                disabled={stake.isPending}
                onClick={() => {
                  void (async () => {
                    if (!locked || !wallet.address) return;
                    if (wallet.chainId !== CHAINS.robinhood.id) await wallet.switchChain("robinhood");
                    const hash = await wallet.sendTransaction({ to: stakeTo, data: claimStakeCalldata() });
                    const receipt = await wallet.waitReceipt(hash);
                    if (receipt.status !== "success") {
                      toast.error("Claim reverted.");
                      return;
                    }
                    toast.success("Reward sent to this wallet.");
                    await page.refetch();
                  })().catch((err) => toast.error(publicWalletError(err)));
                }}
              >
                Claim {formatCompact(d?.earned ?? 0)} $ZNZF
              </Button>
            )}
          </section>

          <aside className="space-y-4">
            <div className="stone-card rounded-2xl p-5">
              <p className="text-sm font-medium">Your position</p>
              <dl className="mt-3 space-y-3 text-sm">
                <Row
                  k="On-chain $ZNZF"
                  v={wallet.connected ? formatCompact(onchain) : "—"}
                  sub={wallet.connected ? "Robinhood Chain" : "Connect to read"}
                />
                <Row k="Locked here" v={wallet.connected ? formatCompact(yourStake) : "—"} />
              </dl>
            </div>
            <div className="stone-card rounded-2xl p-5">
              <p className="text-sm font-medium">How staking works</p>
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
                <li>Stake sends $ZNZF into the stake contract. It is not still sitting in your wallet.</li>
                <li>Unstake returns that amount. Voting weight is the locked balance, not a loose holding.</li>
                <li>Claim pays $ZNZF from the funded reward. It does not pay a share of trading fees.</li>
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                The treasury put 1,000 $ZNZF in for 30 days. {paying ? `${formatCompact(d?.rewardLeft ?? 0)} is still to be paid, through ${endsLabel}.` : "That payment has finished."} Trading fees are not paid here.
              </p>
              <AddZnzfToWallet robinhood={robinhood} arc={arc} image={ZNZF_IPFS_GATEWAY} />
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function StakeForm({
  amt,
  setAmt,
  cap,
  connected,
  helper,
  ready,
  pending,
  over,
  actionLabel,
  onAction,
  onPreset,
  variant,
}: {
  amt: string;
  setAmt: (v: string) => void;
  cap: number;
  connected: boolean;
  helper: string | null;
  ready: boolean;
  pending: boolean;
  over: boolean;
  actionLabel: string;
  onAction: () => void;
  onPreset: (p: number) => void;
  variant: "gold" | "outline";
}) {
  const needsConnect = !connected;
  return (
    <div>
      <label htmlFor="stake-amt" className="text-sm font-medium text-stone">
        Amount
      </label>
      <div
        className={cn(
          "mt-2 flex items-center gap-3 rounded-xl border bg-cream px-3 py-2 focus-within:ring-2 focus-within:ring-ring",
          over ? "border-destructive" : "border-border",
        )}
      >
        <Input
          id="stake-amt"
          className="h-12 flex-1 border-0 bg-transparent px-0 text-lg tabular-nums shadow-none focus-visible:ring-0"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
        />
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3">
          <TokenImage src={ZNZF_IPFS_GATEWAY} alt="Zenze" size={28} protocol seed="znzf" />
          <span className="text-sm font-medium">$ZNZF</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            size="sm"
            disabled={!connected || cap <= 0}
            onClick={() => onPreset(p)}
            className="h-11 rounded-lg"
          >
            {p === 1 ? "Max" : `${p * 100}%`}
          </Button>
        ))}
      </div>
      {helper && <p className={cn("mt-3 text-sm", over ? "text-destructive" : "text-muted-foreground")}>{helper}</p>}
      <Button
        className="mt-5 h-12 w-full rounded-xl text-base"
        variant={needsConnect ? "gold" : variant}
        size="lg"
        disabled={pending || (!needsConnect && !ready)}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stone-card rounded-2xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">
        <p className="font-medium tabular-nums">{v}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </dd>
    </div>
  );
}

function trimAmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const floored = floorDecimal(n, 6);
  return floored === "0" ? "" : floored;
}
