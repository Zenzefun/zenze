import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { encodeFunctionData, parseAbi } from "viem";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShareX } from "@/components/share/share-x";
import { formatAddress } from "@/lib/format";
import { airdropStatus, beginAirdropX, confirmAirdropX, prepareAirdropClaim, spinAirdrop } from "@/lib/server/airdrop";
import { myReferralCode } from "@/lib/server/referral";
import { pageHead } from "@/lib/seo";
import { znzfLaunchpadId } from "@/lib/token-path";
import { cn } from "@/lib/utils";
import { publicWalletError, useWallet } from "@/lib/wallet";

const CLAIM_ABI = parseAbi(["function claim(uint256 total, uint256 deadline, bytes signature)"]);
const WHEEL = ["#d4a545", "#7c9a5c", "#e8c98a", "#6b4f3a"];

export const Route = createFileRoute("/airdrop")({
  component: AirdropPage,
  head: () =>
    pageHead({
      title: "Airdrop",
      description: "Points count after you buy $ZNZF. Hold at least 10,000. The payout uses those points when it opens.",
      path: "/airdrop",
    }),
});

function tokens(value?: string | number) {
  if (typeof value === "number") return value.toLocaleString("en-US");
  return value && value !== "0" ? value : "0";
}

function asNumber(value?: string) {
  return Number((value ?? "0").replace(/,/g, "")) || 0;
}

function when(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Step({
  n,
  title,
  detail,
  done,
  amount,
  action,
}: {
  n: string;
  title: string;
  detail: string;
  done: boolean;
  amount: string;
  action: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-4">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs", done ? "bg-gold text-ink" : "bg-muted text-muted-foreground")}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">{title}</p>
          <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{amount}</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">{action}</div>
      </div>
    </li>
  );
}

function SpinWheel({
  slices,
  index,
  spinId,
}: {
  slices: { points: number; weight: number }[];
  index: number | null;
  spinId: number;
}) {
  const [angle, setAngle] = useState(0);
  const [animate, setAnimate] = useState(false);
  const played = useRef(0);
  useEffect(() => {
    if (index == null || index < 0 || !slices[index]) return;
    const weight = slices.reduce((sum, slice) => sum + slice.weight, 0) || 100;
    const before = slices.slice(0, index).reduce((sum, slice) => sum + slice.weight, 0);
    const center = ((before + slices[index].weight / 2) / weight) * 360;
    const land = (360 - center + 360) % 360;
    const spin = spinId > 0 && played.current !== spinId;
    played.current = spinId;
    if (!spin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimate(false);
      setAngle(land);
      return;
    }
    setAnimate(true);
    setAngle((current) => Math.floor(current / 360) * 360 + 360 * 5 + land);
  }, [index, spinId, slices]);
  let cursor = 0;
  const total = slices.reduce((sum, slice) => sum + slice.weight, 0) || 100;
  const stops = slices.map((slice, i) => {
    const start = (cursor / total) * 360;
    cursor += slice.weight;
    const end = (cursor / total) * 360;
    return `${WHEEL[i % WHEEL.length]} ${start}deg ${end}deg`;
  });
  return (
    <div className="relative mx-auto my-4 size-64" aria-hidden>
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-[9px] border-t-[16px] border-x-transparent border-t-foreground" />
      <div
        className={cn(
          "absolute inset-2 rounded-full shadow-[inset_0_0_0_10px_rgba(253,246,227,0.45)]",
          animate && "motion-safe:transition-transform motion-safe:duration-[4200ms] motion-safe:ease-[cubic-bezier(.12,.7,.08,1)]",
        )}
        style={{
          background: `conic-gradient(${stops.join(", ")})`,
          transform: `rotate(${angle}deg)`,
        }}
      />
      <div className="absolute inset-[34%] z-10 grid place-items-center rounded-full border border-border bg-card text-center shadow-sm">
        <span className="font-display text-sm">{index == null ? "Spin" : `${slices[index]?.points ?? ""}`}</span>
      </div>
    </div>
  );
}

function AirdropPage() {
  const wallet = useWallet();
  const address = wallet.address;
  const [spinIndex, setSpinIndex] = useState<number | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [reveal, setReveal] = useState<{ points: number; fresh: boolean } | null>(null);
  const [popup, setPopup] = useState(false);
  const [xLine, setXLine] = useState<{ code: string; followUrl: string; postUrl: string } | null>(null);
  const [xLink, setXLink] = useState("");
  const [motionOk, setMotionOk] = useState(false);
  const q = useQuery({
    queryKey: ["airdrop", address],
    queryFn: () => airdropStatus({ data: { wallet: address ?? "" } }),
  });
  const invite = useQuery({
    queryKey: ["referral-code", address],
    queryFn: () => myReferralCode({ data: { wallet: address ?? "" } }),
    enabled: Boolean(address),
  });
  useEffect(() => {
    setMotionOk(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const flag = new URLSearchParams(window.location.search).get("x");
    if (flag) toast.message("Follow @ZenzeFun, then post the line from this page.");
  }, []);
  const connectX = useMutation({
    mutationFn: () => beginAirdropX({ data: { wallet: address ?? "" } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setXLine({ code: res.code, followUrl: res.followUrl, postUrl: res.postUrl });
      const opened = window.open(res.postUrl, "_blank", "noopener,noreferrer");
      if (!opened) toast.message("The X window was blocked. The line is on this page.");
    },
    onError: (err) => toast.error(err.message),
  });
  const confirmX = useMutation({
    mutationFn: () => confirmAirdropX({ data: { wallet: address ?? "", url: xLink } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`@${res.handle} posted the line.`);
      void q.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const spin = useMutation({
    mutationFn: () => spinAirdrop({ data: { wallet: address ?? "" } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSpinId((n) => n + 1);
      setSpinIndex(res.index);
      const wait = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 4200;
      window.setTimeout(() => {
        setReveal({ points: res.points, fresh: !res.already });
        if (!res.already) setPopup(true);
        void q.refetch();
      }, wait);
    },
    onError: (err) => toast.error(err.message),
  });
  const claim = useMutation({
    mutationFn: async () => {
      const prepared = await prepareAirdropClaim({ data: { wallet: address ?? "" } });
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
      void q.refetch();
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });
  const data = q.data;
  const rules = data?.rules;
  const funded = asNumber(data?.poolFunded);
  const left = asNumber(data?.poolBalance);
  const slices = rules?.spin ?? [
    { points: 5, weight: 50 },
    { points: 10, weight: 30 },
    { points: 20, weight: 15 },
    { points: 30, weight: 5 },
  ];
  const landed = data?.spun ? slices.findIndex((slice) => slice.points === data.spinPoints) : -1;
  const result = reveal ?? (data?.spun ? { points: data.spinPoints, fresh: false } : null);
  const opens = when(data?.claimsAt);
  const open = Boolean(data?.claimsOpen);
  const connect = () => {
    void wallet.connect().catch((err) => toast.error(publicWalletError(err)));
  };
  const hold = tokens(rules?.minHold ?? 10000);
  const friends = data?.referrals ?? 0;
  const friendMax = rules?.referralMax ?? 10;
  const followUrl = xLine?.followUrl || data?.followUrl || "https://x.com/intent/follow?screen_name=ZenzeFun";
  const tasks = [
    {
      title: "Buy $ZNZF",
      detail: data?.bought ? `You bought it. Hold at least ${hold}.` : "Buy $ZNZF. Nothing else counts until this wallet does.",
      done: Boolean(data?.bought),
      amount: `${(rules?.buy ?? 20).toLocaleString("en-US")} pts`,
    },
    {
      title: "Join Telegram",
      detail: data?.telegramOk ? "This wallet is in @zenzefun." : "Join @zenzefun, then tap Start in the bot. That is what counts this wallet.",
      done: Boolean(data?.telegramOk),
      amount: `${(rules?.telegram ?? 5).toLocaleString("en-US")} pts`,
    },
    {
      title: "Follow @ZenzeFun",
      detail: data?.xFollow ? `@${data.xHandle} posted the line.` : "Follow @ZenzeFun and post the line from this page. Then paste the post link.",
      done: Boolean(data?.xFollow),
      amount: `${(rules?.x ?? 5).toLocaleString("en-US")} pts`,
    },
    {
      title: "Launch a token",
      detail: data?.launched ? "This wallet launched a token." : "Launch one token. A second launch does not add points.",
      done: Boolean(data?.launched),
      amount: `${(rules?.launch ?? 8).toLocaleString("en-US")} pts`,
    },
    {
      title: "Get a buyer",
      detail: data?.seen ? "Another wallet bought your token." : "A different wallet has to buy the token you launched.",
      done: Boolean(data?.seen),
      amount: `${(rules?.seen ?? 4).toLocaleString("en-US")} pts`,
    },
    {
      title: "Invite friends",
      detail: `${friends} of ${friendMax} friends bought $ZNZF and still hold ${hold}.`,
      done: friends >= friendMax && friendMax > 0,
      amount: `${(rules?.referral ?? 5).toLocaleString("en-US")} pts each`,
    },
  ];
  const inviteUrl = invite.data && invite.data.ok ? invite.data.url : "";

  function actionFor(title: string) {
    if (title === "Buy $ZNZF") {
      return (
        <Button asChild size="default" variant="gold">
          <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>Buy $ZNZF</Link>
        </Button>
      );
    }
    if (title === "Join Telegram") {
      return (
        <>
          <Button asChild size="default" variant="outline">
            <a href={data?.group || "https://t.me/zenzefun"} target="_blank" rel="noopener noreferrer">Join @zenzefun</a>
          </Button>
          {address && data?.bot ? (
            <Button asChild size="default" variant="gold">
              <a href={data.bot} target="_blank" rel="noopener noreferrer">Tap Start</a>
            </Button>
          ) : null}
          {data?.room ? (
            <Button asChild size="default" variant="outline">
              <a href={data.room} target="_blank" rel="noopener noreferrer">Channel</a>
            </Button>
          ) : null}
        </>
      );
    }
    if (title === "Follow @ZenzeFun") {
      return (
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button asChild size="default" variant="outline">
              <a href={followUrl} target="_blank" rel="noopener noreferrer">Follow</a>
            </Button>
            <Button
              size="default"
              variant="gold"
              disabled={connectX.isPending || Boolean(data?.xFollow)}
              onClick={() => {
                if (!address) {
                  connect();
                  return;
                }
                connectX.mutate();
              }}
            >
              {!address ? "Connect wallet" : data?.xFollow ? "Posted" : connectX.isPending ? "Opening X…" : "Post the line"}
            </Button>
          </div>
          {xLine && !data?.xFollow ? (
            <div className="flex w-full flex-col gap-2">
              <p className="rounded-md bg-muted px-3 py-2 font-mono text-sm">Following @ZenzeFun {xLine.code}</p>
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <Input
                  value={xLink}
                  onChange={(e) => setXLink(e.target.value)}
                  placeholder="Paste the post link"
                  aria-label="Post link"
                />
                <Button size="default" variant="gold" disabled={confirmX.isPending || xLink.trim().length < 12} onClick={() => confirmX.mutate()}>
                  {confirmX.isPending ? "Checking…" : "Confirm"}
                </Button>
                <Button asChild size="default" variant="outline">
                  <a href={xLine.postUrl} target="_blank" rel="noopener noreferrer">Open the post</a>
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    if (title === "Launch a token") {
      return (
        <Button asChild size="default" variant="gold">
          <Link to="/launch">Launch a token</Link>
        </Button>
      );
    }
    if (title === "Get a buyer") {
      return data?.launchId ? (
        <Button asChild size="default" variant="gold">
          <Link to="/token/$id" params={{ id: data.launchId }}>Open your token</Link>
        </Button>
      ) : (
        <Button asChild size="default" variant="gold">
          <Link to="/launch">Launch first</Link>
        </Button>
      );
    }
    return (
      <div className="flex w-full min-w-0 flex-col gap-2">
        {inviteUrl ? (
          <Input
            id="invite-link"
            readOnly
            value={inviteUrl}
            aria-label="Invite link"
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{address ? "Your link is almost ready." : "Connect a wallet and the invite link shows here."}</p>
        )}
        <Button
          size="default"
          variant="gold"
          className="w-fit"
          onClick={() => {
            if (!address) {
              connect();
              return;
            }
            if (!inviteUrl) {
              toast.message(invite.data && !invite.data.ok ? invite.data.error : "Your link is almost ready.");
              return;
            }
            const field = document.getElementById("invite-link") as HTMLInputElement | null;
            field?.focus();
            field?.select();
            void navigator.clipboard.writeText(inviteUrl).then(
              () => toast.success("Invite link copied."),
              () => toast.message("Select the link and copy it."),
            );
          }}
        >
          {address ? "Copy invite link" : "Connect wallet"}
        </Button>
      </div>
    );
  }

  const heldNow = asNumber(data?.held);
  const needHold = asNumber(hold);
  const holding = needHold > 0 ? Math.max(0, Math.min(100, (heldNow / needHold) * 100)) : 0;
  const preview = data?.preview ?? "0";
  const totalPoints = data?.totalPoints ?? 0;
  const sharePct = data?.sharePct ?? 0;
  const cap = data?.maxPoints ?? 0;
  const shownShare = open ? (data?.claim ?? "0") : preview;
  const shareLine = `I have ${(data?.points ?? 0).toLocaleString("en-US")} points in the $ZNZF drop. One point is one share of the pool. Hold ${hold}.`;
  const counted = data?.bought
    ? heldNow >= needHold
      ? "Counted. One point is one share."
      : `Buy is in. Hold at least ${hold} or these points drop out.`
    : "These points count after you buy $ZNZF.";

  return (
    <AppShell>
      <article className="mx-auto max-w-5xl px-4 py-8 md:py-10">
        <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 max-w-xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={open ? "moss" : "gold"}>{open ? "Payout open" : "Points counting"}</Badge>
                {address && data?.bought ? <Badge variant={heldNow >= needHold ? "moss" : "outline"}>{heldNow >= needHold ? "Holding enough" : "Hold more"}</Badge> : null}
              </div>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Airdrop</h1>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Your share is your points divided by every eligible point, then multiplied by what is still in the pool.
                A wallet counts only after it buys $ZNZF and still holds {hold}. More eligible points make each point smaller.
                {open ? " Shares were frozen when the payout opened." : opens ? ` Payout opens ${opens}.` : " Payout is not open yet."}
              </p>
            </div>
            <div className="grid min-w-[16rem] gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="text-xs text-muted-foreground">Your points</p>
                <p className="font-display text-4xl font-semibold tabular-nums">{data?.points ?? 0}</p>
                <p className="text-sm text-muted-foreground">{cap > 0 ? `of ${cap.toLocaleString("en-US")} possible` : "Connect to see yours"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{open ? "Frozen share" : "If it opened today"}</p>
                <p className="font-display text-4xl font-semibold tabular-nums">{shownShare}</p>
                <p className="text-sm text-muted-foreground">{sharePct > 0 ? `${sharePct}% of ${totalPoints.toLocaleString("en-US")} points` : "No share yet"}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">You hold</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{address ? tokens(data?.held) : "—"}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Need to hold</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{hold}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Eligible points</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{totalPoints.toLocaleString("en-US")}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">Still in the pool</p>
              <p className="mt-1 text-lg font-medium tabular-nums">{funded > 0 ? `${tokens(left)} $ZNZF` : "Not filled yet"}</p>
            </div>
          </div>
          {address ? (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gold" style={{ width: `${holding}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{heldNow >= needHold ? "This wallet is above the hold." : `${tokens(data?.held)} of ${hold} $ZNZF`}</p>
            </div>
          ) : null}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="gold" size="lg">
              <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>Buy $ZNZF</Link>
            </Button>
            {!address ? (
              <Button size="lg" variant="outline" onClick={() => connect()}>Connect wallet</Button>
            ) : (
              <ShareX text={shareLine} path="/airdrop" label="Share your points" />
            )}
            {address && open ? (
              <Button
                size="lg"
                variant={data?.claim !== "0" ? "gold" : "outline"}
                disabled={claim.isPending}
                onClick={() => {
                  if (!data || data.claim === "0") {
                    toast.message("No share is assigned yet.");
                    return;
                  }
                  claim.mutate();
                }}
              >
                {claim.isPending ? "Confirm in your wallet" : "Take your share"}
              </Button>
            ) : null}
          </div>
        </section>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
          <section className="rounded-[1.6rem] border border-border bg-card p-5">
            <h2 className="font-display text-3xl font-semibold">One spin</h2>
            <p className="mt-1 text-sm text-muted-foreground">One spin for this wallet. It counts after the buy.</p>
            <SpinWheel slices={slices} index={spinIndex ?? (landed >= 0 ? landed : null)} spinId={spinId} />
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {slices.map((slice, i) => (
                <li key={`${slice.points}-${slice.weight}`} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: WHEEL[i % WHEEL.length] }} />
                    {slice.points.toLocaleString("en-US")} pts
                  </span>
                  <span className="tabular-nums text-muted-foreground">{slice.weight}%</span>
                </li>
              ))}
            </ul>
            {result && !popup ? (
              <div className="mt-4 text-center" role="status">
                <p className="font-display text-2xl font-semibold tabular-nums">{result.points.toLocaleString("en-US")} points</p>
                <p className="mt-1 text-sm text-muted-foreground">{counted}</p>
                <div className="mt-3 flex justify-center">
                  <ShareX
                    text={`I spun ${result.points.toLocaleString("en-US")} points. One point is the same share of the payout.`}
                    path="/airdrop"
                    label="Share on X"
                  />
                </div>
              </div>
            ) : null}
            <Dialog open={popup && Boolean(result)} onOpenChange={setPopup}>
              <DialogContent className="max-w-sm text-center">
                <div className="mx-auto grid size-40 place-items-center overflow-hidden rounded-full bg-[#faf3e0]" aria-hidden>
                  <img
                    src="/brand/capy-mark-512.webp"
                    alt=""
                    width={144}
                    height={144}
                    className={cn("size-36 rounded-full object-cover", motionOk && "capy-celebrate")}
                  />
                </div>
                <DialogTitle className="mt-4 text-3xl tabular-nums">{(result?.points ?? 0).toLocaleString("en-US")} points</DialogTitle>
                <DialogDescription>{counted}</DialogDescription>
                <div className="mt-4 flex justify-center">
                  <ShareX
                    text={`I spun ${(result?.points ?? 0).toLocaleString("en-US")} points. One point is the same share of the payout.`}
                    path="/airdrop"
                    label="Share on X"
                  />
                </div>
              </DialogContent>
            </Dialog>
            <Button
              className="mt-4 h-12 w-full"
              variant="gold"
              disabled={Boolean(address && data?.spun) || spin.isPending}
              onClick={() => {
                if (!address) {
                  connect();
                  return;
                }
                spin.mutate();
              }}
            >
              {!address ? "Connect wallet" : data?.spun ? `You spun ${data.spinPoints.toLocaleString("en-US")} pts` : spin.isPending ? "Spinning…" : "Spin"}
            </Button>
          </section>

          <section className="rounded-[1.6rem] border border-border bg-card px-5">
            <h2 className="pt-5 font-display text-3xl font-semibold">Tasks</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each line says what actually counts.</p>
            <ol className="mt-2 divide-y divide-border">
              {tasks.map((task, index) => (
                <Step key={task.title} n={String(index + 1)} {...task} action={actionFor(task.title)} />
              ))}
            </ol>
          </section>
        </div>

        <section className="mt-4 rounded-[1.6rem] border border-border bg-card px-5 pb-2">
          <h2 className="pt-5 font-display text-2xl font-semibold">Standings</h2>
          <p className="mt-1 text-sm text-muted-foreground">Wallets with points. A wallet under the hold is not in the split.</p>
          <ul className="mt-2 divide-y divide-border">
            {(data?.board ?? []).length === 0 ? <li className="py-4 text-sm text-muted-foreground">No one is ready yet.</li> : null}
            {(data?.board ?? []).map((row, index) => (
              <li key={row.wallet} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 font-mono">{formatAddress(row.wallet)}</span>
                <span className="tabular-nums">
                  {row.points} pts
                  {totalPoints > 0 ? ` · ${Math.round((row.points / totalPoints) * 1000) / 10}%` : ""}
                  {open ? ` · ${row.claim}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </AppShell>
  );
}
