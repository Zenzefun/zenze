import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { encodeFunctionData, parseAbi } from "viem";
import { AppShell } from "@/components/layout/app-shell";
import { SmartImage } from "@/components/media/smart-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
      description: "Earn points. When this opens, the pool is shared by those points. One point is the same share for every wallet.",
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
    <li className={cn("flex flex-col rounded-[1.4rem] border bg-card p-4", done ? "border-gold shadow-[0_12px_30px_-24px_rgba(212,165,69,0.9)]" : "border-border")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm", done ? "bg-gold text-ink" : "bg-muted text-muted-foreground")}>
          {done ? <Check className="size-4" /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium">{title}</p>
            <p className="font-display text-lg tabular-nums">{amount}</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{action}</div>
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
  cursor = 0;
  return (
    <div className="relative mx-auto my-4 size-64">
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 border-x-[9px] border-t-[16px] border-x-transparent border-t-foreground" aria-hidden />
      <div
        className={cn(
          "absolute inset-2 rounded-full shadow-[inset_0_0_0_10px_rgba(253,246,227,0.45)]",
          animate && "motion-safe:transition-transform motion-safe:duration-[4200ms] motion-safe:ease-[cubic-bezier(.12,.7,.08,1)]",
        )}
        style={{
          background: `conic-gradient(${stops.join(", ")})`,
          transform: `rotate(${angle}deg)`,
        }}
      >
        {slices.map((slice, i) => {
          const mid = ((cursor + slice.weight / 2) / total) * 360;
          cursor += slice.weight;
          const rad = ((mid - 90) * Math.PI) / 180;
          return (
            <span
              key={`${slice.points}-${i}`}
              className="absolute left-1/2 top-1/2 rounded-full bg-card/95 px-1.5 py-0.5 text-[11px] font-semibold text-foreground"
              style={{ transform: `translate(-50%, -50%) translate(${Math.cos(rad) * 78}px, ${Math.sin(rad) * 78}px) rotate(${mid}deg)` }}
            >
              {slice.points}
            </span>
          );
        })}
      </div>
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
      window.open(res.postUrl, "_blank", "noopener,noreferrer");
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
      return wallet.sendTransaction({ to: prepared.drop, data });
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
  const waiting = funded > 0 ? Math.max(0, Math.min(100, (left / funded) * 100)) : 0;
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
  const tasks = [
    {
      title: "Buy $ZNZF",
      detail: data?.bought ? "You're in. Keep holding it." : "Buy $ZNZF. That is the first step.",
      done: Boolean(data?.bought),
      amount: `${(rules?.buy ?? 20).toLocaleString("en-US")} pts`,
    },
    {
      title: "Join Telegram",
      detail: data?.telegramOk ? "You're in the room." : "Open the bot, tap start, then join the room.",
      done: Boolean(data?.telegramOk),
      amount: `${(rules?.telegram ?? 5).toLocaleString("en-US")} pts`,
    },
    {
      title: "Follow @ZenzeFun",
      detail: data?.xFollow ? `@${data.xHandle} posted the line.` : "Follow @ZenzeFun, then post the line this page gives you.",
      done: Boolean(data?.xFollow),
      amount: `${(rules?.x ?? 5).toLocaleString("en-US")} pts`,
    },
    {
      title: "Launch a token",
      detail: data?.launched ? "Your launch is in." : "Launch one token. A second one does not add more.",
      done: Boolean(data?.launched),
      amount: `${(rules?.launch ?? 8).toLocaleString("en-US")} pts`,
    },
    {
      title: "Get a buyer",
      detail: data?.seen ? "Someone bought your token." : "Another wallet buys the token you launched.",
      done: Boolean(data?.seen),
      amount: `${(rules?.seen ?? 4).toLocaleString("en-US")} pts`,
    },
    {
      title: "Invite friends",
      detail: `${data?.referrals ?? 0} of ${rules?.referralMax ?? 10} friends bought $ZNZF.`,
      done: (data?.referrals ?? 0) > 0,
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
          <Button
            size="default"
            variant="gold"
            onClick={() => {
              if (!address) {
                connect();
                return;
              }
              if (!data?.bot) {
                toast.message("The room opens shortly.");
                return;
              }
              window.open(data.bot, "_blank", "noopener,noreferrer");
            }}
          >
            {address ? "Join Telegram" : "Connect wallet"}
          </Button>
          {data?.room ? (
            <Button asChild size="default" variant="outline">
              <a href={data.room} target="_blank" rel="noopener noreferrer">Open the room</a>
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
              <a href={xLine?.followUrl || data?.x || "https://x.com/intent/follow?screen_name=ZenzeFun"} target="_blank" rel="noopener noreferrer">
                Follow
              </a>
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
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <input
                value={xLink}
                onChange={(e) => setXLink(e.target.value)}
                placeholder="Paste the post link"
                aria-label="Post link"
                className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
              />
              <Button size="default" variant="gold" disabled={confirmX.isPending || xLink.trim().length < 12} onClick={() => confirmX.mutate()}>
                {confirmX.isPending ? "Checking…" : "Confirm"}
              </Button>
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
      <Button
        size="default"
        variant="gold"
        onClick={() => {
          if (!address) {
            connect();
            return;
          }
          if (!inviteUrl) {
            toast.message("Your link is almost ready.");
            return;
          }
          void navigator.clipboard.writeText(inviteUrl);
          toast.success("Invite link copied.");
        }}
      >
        {address ? "Copy invite link" : "Connect wallet"}
      </Button>
    );
  }

  return (
    <AppShell>
      <article className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <section className="overflow-hidden rounded-[2rem] border border-border bg-card">
          <div className="grid gap-8 p-6 md:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-stone">Airdrop</p>
              <Badge className="mt-3" variant={open ? "moss" : "gold"}>{open ? "Open" : opens ? "Opens soon" : "Points count now"}</Badge>
              <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight text-stone tabular-nums md:text-7xl">
                {data?.points ?? 0}
              </h1>
              <p className="mt-2 font-display text-2xl text-stone">points</p>
              <p className="mt-4 max-w-md text-base text-muted-foreground">
                Earn points now. When this opens, the pool is shared by those points. One point is the same share for every wallet. Keep at least {tokens(rules?.minHold ?? 10000)} $ZNZF.
              </p>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gold" style={{ width: `${waiting}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Pool {tokens(funded)} $ZNZF · {tokens(left)} still there
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-background p-5 shadow-[0_18px_50px_-36px_rgba(43,43,43,0.7)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone">{open ? "Your share" : "Your points"}</p>
                  <p className="mt-2 font-display text-5xl font-semibold tabular-nums">{open ? (data?.claim ?? "0") : (data?.points ?? 0)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{open ? `${data?.points ?? 0} points · you hold ${data?.held ?? "0"} $ZNZF.` : `You hold ${data?.held ?? "0"} $ZNZF.`}</p>
                </div>
                <SmartImage
                  src="/brand/capy-zen.webp"
                  alt="Capy"
                  width={96}
                  height={96}
                  className="size-16 rounded-2xl object-cover"
                  rounded="2xl"
                />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {open ? "The pool is open. Your share is your points divided by every point." : opens ? `Opens ${opens}. Points keep counting until then.` : "Not open yet. Points keep counting."}
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <Button asChild variant="gold" size="lg">
                  <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>
                    Buy $ZNZF
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant={open && data?.claim !== "0" ? "gold" : "outline"}
                  disabled={claim.isPending}
                  onClick={() => {
                    if (!address) {
                      connect();
                      return;
                    }
                    if (!open) {
                      toast.message(opens ? `Opens ${opens}.` : "Not open yet.");
                      return;
                    }
                    if (!data || data.claim === "0") {
                      toast.message("No share is assigned yet.");
                      return;
                    }
                    claim.mutate();
                  }}
                >
                  {!address ? "Connect wallet" : claim.isPending ? "Confirm in your wallet" : open ? "Take your share" : "Closed"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[1.6rem] border border-border bg-card p-5">
            <h2 className="font-display text-3xl font-semibold">One spin</h2>
            <p className="mt-1 text-sm text-muted-foreground">Once per connected wallet. The points count after that wallet buys $ZNZF.</p>
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
                <div className="mt-3 flex justify-center">
                  <ShareX
                    text={`I spun ${result.points.toLocaleString("en-US")} points. One point is the same share when the pool opens.`}
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
                <DialogDescription>Yours. One point is the same share when the pool opens.</DialogDescription>
                <div className="mt-4 flex justify-center">
                  <ShareX
                    text={`I spun ${(result?.points ?? 0).toLocaleString("en-US")} points. One point is the same share when the pool opens.`}
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

          <div className="flex flex-col gap-4">
            <section className="rounded-[1.6rem] border border-border bg-card px-4">
              <h2 className="pt-4 font-display text-2xl font-semibold">Airdrop</h2>
              <ul className="mt-2 divide-y divide-border">
                {(data?.board ?? []).length === 0 ? <li className="py-4 text-sm text-muted-foreground">No one is ready yet.</li> : null}
                {(data?.board ?? []).map((row) => (
                  <li key={row.wallet} className="flex justify-between py-3 text-sm">
                    <span className="font-mono">{formatAddress(row.wallet)}</span>
                    <span className="tabular-nums">{open ? `${row.claim} $ZNZF` : `${row.points} pts`}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {tasks.map((task, index) => (
            <Step key={task.title} n={String(index + 1).padStart(2, "0")} {...task} action={actionFor(task.title)} />
          ))}
        </ol>
      </article>
    </AppShell>
  );
}
