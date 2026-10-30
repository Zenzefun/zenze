import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Megaphone, Rocket, ShieldCheck, Star, Users } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { encodeFunctionData, parseAbi } from "viem";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareX } from "@/components/share/share-x";
import { airdropStatus, creatorQuestStatus, prepareAirdropClaim } from "@/lib/server/airdrop";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { publicWalletError, useWallet } from "@/lib/wallet";

const CLAIM_ABI = parseAbi(["function claim(uint256 total, uint256 deadline, bytes signature)"]);

export const Route = createFileRoute("/airdrop")({
  component: CreatorQuestPage,
  head: () =>
    pageHead({
      title: "Creator Quest",
      description:
        "Launch a token and get 3 real buyers. Finish the quest and your token gets a Featured slot on Zenzen and a shoutout from @ZenzeFun.",
      path: "/airdrop",
    }),
});

const REASON: Record<string, string> = {
  ok: "Counts",
  creator: "Your own wallet",
  funded: "Funded by your wallet",
  young: "Wallet too new",
  unverified: "Could not check yet",
};

function when(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Step({ n, title, detail, done, children }: { n: number; title: string; detail: string; done: boolean; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-4">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs", done ? "bg-gold text-on-gold" : "bg-muted text-muted-foreground")}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        {children ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </li>
  );
}

function CreatorQuestPage() {
  const wallet = useWallet();
  const address = wallet.address;
  const q = useQuery({
    queryKey: ["creator-quest", address],
    queryFn: () => creatorQuestStatus({ data: { wallet: address ?? "" } }),
    refetchInterval: 60_000,
  });
  const data = q.data;
  const rules = data?.rules ?? { minBuyers: 3, minWalletAgeDays: 7, featuredDays: 7 };
  const counted = data?.counted ?? 0;
  const progress = Math.min(100, (counted / Math.max(1, rules.minBuyers)) * 100);
  const connect = () => {
    void wallet.connect().catch((err) => toast.error(publicWalletError(err)));
  };
  const token = data?.token;
  const shareText = data?.completed
    ? `My token $${token?.symbol ?? ""} finished the Zenzen Creator Quest: launched and ${counted} real buyers.`
    : token
      ? `I launched $${token.symbol} on Zenzen. ${counted} of ${rules.minBuyers} buyers for the Creator Quest. Come trade it.`
      : "Launch a token on Zenzen in 60 seconds and take on the Creator Quest.";
  const sharePath = token ? `/token/${token.id}` : "/airdrop";

  return (
    <AppShell>
      <article className="mx-auto max-w-5xl px-4 py-8 md:py-10">
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 max-w-xl">
              <Badge variant={data?.completed ? "moss" : "gold"}>{data?.completed ? "Quest complete" : "Creator Quest"}</Badge>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Creator Quest</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Launch a token and get {rules.minBuyers} real buyers. That is the whole quest. You do not need to buy or
                hold $ZNZF.
              </p>
            </div>
            <div className="min-w-[16rem]">
              <p className="text-xs text-muted-foreground">Real buyers</p>
              <p className="font-display text-4xl font-semibold tabular-nums">
                {address ? `${Math.min(counted, rules.minBuyers)} / ${rules.minBuyers}` : "—"}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-moss" style={{ width: `${address ? Math.max(progress, 2) : 0}%` }} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {!address ? "Connect to see yours" : data?.completed ? `Done ${when(data.completedAt)}` : token ? `On $${token.symbol}` : "Launch a token first"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {!address ? (
              <Button size="lg" variant="gold" onClick={() => connect()}>Connect wallet</Button>
            ) : token ? (
              <Button asChild size="lg" variant="gold">
                <Link to="/token/$id" params={{ id: token.id }}>Open ${token.symbol}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="gold">
                <Link to="/launch">
                  <Rocket aria-hidden />
                  Launch a token
                </Link>
              </Button>
            )}
            <ShareX text={shareText} path={sharePath} label="Share on X" />
          </div>
        </section>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <section className="rounded-[1.6rem] border border-border bg-card px-5">
            <h2 className="pt-5 font-display text-3xl font-semibold">Tasks</h2>
            <ol className="mt-2 divide-y divide-border">
              <Step
                n={1}
                title="Launch a token"
                detail={data?.launched && token ? `You launched $${token.symbol}.` : "Name, ticker, image. It takes about a minute."}
                done={Boolean(data?.launched)}
              >
                {!data?.launched ? (
                  <Button asChild variant="gold">
                    <Link to="/launch">Launch a token</Link>
                  </Button>
                ) : null}
              </Step>
              <Step
                n={2}
                title={`Get ${rules.minBuyers} unique buyers`}
                detail={
                  data?.completed
                    ? `${counted} real buyers. Quest complete.`
                    : `${Math.min(counted, rules.minBuyers)} of ${rules.minBuyers} so far. Share your token so other people buy it.`
                }
                done={Boolean(data?.completed)}
              >
                {token ? <ShareX text={shareText} path={sharePath} label="Share your token" /> : null}
              </Step>
            </ol>
            {data?.buyers?.length ? (
              <div className="border-t border-border py-4">
                <p className="text-sm font-medium">Buyers checked</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {data.buyers.map((b) => (
                    <li key={b.wallet} className="flex justify-between gap-3">
                      <span className="font-mono">{b.wallet}</span>
                      <span className={b.ok ? "text-moss" : "text-muted-foreground"}>{REASON[b.reason] ?? b.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <div className="grid gap-4">
            <section className="rounded-[1.6rem] border border-border bg-card p-5">
              <h2 className="font-display text-2xl font-semibold">What you get</h2>
              <ul className="mt-3 space-y-3 text-sm">
                <li className="flex gap-3">
                  <Star className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                  <span>
                    <span className="font-medium">A Featured slot.</span>{" "}
                    <span className="text-muted-foreground">Your token can show in the Featured card on the home page for up to {rules.featuredDays} days.</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <Megaphone className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
                  <span>
                    <span className="font-medium">A shoutout from @ZenzeFun.</span>{" "}
                    <span className="text-muted-foreground">We post about finished quests on X.</span>
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                That is all. There is no cash, token, or points payout, and finishing the quest says nothing about what your token is worth.
                {data?.featuredUntil ? ` Your Featured window ends ${when(data.featuredUntil)}.` : ""}
              </p>
            </section>
            <section className="rounded-[1.6rem] border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
                <ShieldCheck className="size-5 text-moss" aria-hidden />
                What counts as a real buyer
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Users className="mt-0.5 size-4 shrink-0" aria-hidden />A different wallet from yours.</li>
                <li className="flex gap-2"><Users className="mt-0.5 size-4 shrink-0" aria-hidden />Not funded by your wallet: no token transfer from you to it.</li>
                <li className="flex gap-2"><Users className="mt-0.5 size-4 shrink-0" aria-hidden />At least {rules.minWalletAgeDays} days old: it sent a transaction before then.</li>
              </ul>
            </section>
          </div>
        </div>

        {address ? <EarlierShare address={address} /> : null}
      </article>
    </AppShell>
  );
}

/**
 * Wallets that already hold a frozen share from the earlier $ZNZF drop can still take it.
 * Nothing new is offered here: the block only shows when a share is already assigned.
 */
function EarlierShare({ address }: { address: string }) {
  const wallet = useWallet();
  const drop = useQuery({
    queryKey: ["airdrop", address],
    queryFn: () => airdropStatus({ data: { wallet: address } }),
    staleTime: 60_000,
  });
  const claim = useMutation({
    mutationFn: async () => {
      const prepared = await prepareAirdropClaim({ data: { wallet: address } });
      if (!prepared.ok) throw new Error(prepared.error);
      await wallet.switchChain("robinhood");
      const data = encodeFunctionData({
        abi: CLAIM_ABI,
        functionName: "claim",
        args: [BigInt(prepared.total), BigInt(prepared.deadline), prepared.signature as `0x${string}`],
      });
      const hash = await wallet.sendTransaction({ to: prepared.drop, data });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("The claim did not go through.");
      return hash;
    },
    onSuccess: (hash) => {
      toast.success(`Claim sent. ${hash.slice(0, 10)}…`);
      void drop.refetch();
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });
  const d = drop.data;
  if (!d || !d.claimsOpen || !d.claimWei || d.claimWei === "0") return null;
  return (
    <section className="mt-4 rounded-[1.6rem] border border-border bg-card p-5">
      <h2 className="font-display text-xl font-semibold">Earlier $ZNZF drop</h2>
      <p className="mt-1 text-sm text-muted-foreground">This wallet has a share assigned from the earlier drop: {d.claim} $ZNZF.</p>
      <Button className="mt-3" variant="gold" disabled={claim.isPending} onClick={() => claim.mutate()}>
        {claim.isPending ? "Confirm in your wallet" : "Take your share"}
      </Button>
    </section>
  );
}
