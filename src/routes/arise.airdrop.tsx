import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { airdropDesk, saveClaimWindow, saveDropRules } from "@/lib/server/airdrop";
import { formatAddress } from "@/lib/format";

export const Route = createFileRoute("/arise/airdrop")({ component: AirdropDesk });

type FormRules = {
  buy: number;
  telegram: number;
  x: number;
  launch: number;
  seen: number;
  referral: number;
  referralMax: number;
  minHold: number;
  spin: { points: number; weight: number }[];
};

function AirdropDesk() {
  const q = useQuery({ queryKey: ["airdrop-desk"], queryFn: () => airdropDesk(), retry: false });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Reading the drop…</p>;
  if (q.isError || !q.data?.ok) {
    return (
      <div className="max-w-md rounded-2xl border border-border p-5">
        <h1 className="text-xl font-semibold">Drop</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {q.error instanceof Error ? q.error.message : "The desk could not read the drop. Sign in again with the treasury wallet."}
        </p>
        <Button className="mt-4" variant="gold" type="button" onClick={() => void q.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <DeskBody data={q.data} onSaved={() => void q.refetch()} />;
}

function DeskBody({
  data,
  onSaved,
}: {
  data: NonNullable<Awaited<ReturnType<typeof airdropDesk>>>;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormRules>({ ...data.rules, spin: data.rules.spin?.length ? data.rules.spin : [] });
  useEffect(() => setForm(data.rules), [data.rules]);
  const save = useMutation({
    mutationFn: () => saveDropRules({ data: form }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Points saved. If nobody has been paid, the open split uses these points.");
        onSaved();
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const setNumber = (key: keyof Omit<FormRules, "spin">, value: string) => {
    setForm((current) => ({ ...current, [key]: Number(value) }));
  };
  const fields = [
    ["buy", "Buy $ZNZF, points"],
    ["telegram", "Telegram room, points"],
    ["x", "X follow, points"],
    ["launch", "Launch a token, points"],
    ["seen", "Someone buys that token, points"],
    ["referral", "Each friend who buys $ZNZF, points"],
    ["referralMax", "Friend limit"],
    ["minHold", "Minimum $ZNZF still held"],
  ] as const;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Drop</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Steps earn points. Opening the switch splits the on-chain balance by those points. One point is one share. Closing it before anyone is paid clears the split, so the next open counts again.
      </p>
      <ClaimGate
        enabled={data.claimsEnabled}
        at={data.claimsAt}
        live={data.claimsOpen && !data.paused}
        paused={data.paused}
        onSaved={onSaved}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Funded" value={`${data.funded} $ZNZF`} />
        <Stat label="Still in the pool" value={`${data.balance} $ZNZF`} />
        <Stat label="Claimed" value={`${data.claimed} $ZNZF`} />
        <Stat label="Contract" value={data.pool ? formatAddress(data.pool) : "Not deployed"} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Signer {data.signer ? "ready" : "missing"}. Follow check reads a public post. No X API key.
        {data.paused ? " Claims are paused on the contract." : ""}
        {data.owner ? ` Owner ${formatAddress(data.owner)}.` : ""}
      </p>

      <form
        className="mt-6 grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {fields.map(([key, label]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              inputMode="decimal"
              value={Number.isFinite(form[key]) ? String(form[key]) : ""}
              onChange={(event) => setNumber(key, event.target.value)}
            />
          </div>
        ))}
        <div className="space-y-3 sm:col-span-2">
          <p className="text-sm font-medium">Spin</p>
          {form.spin.map((slice, index) => (
            <div key={index} className="grid grid-cols-2 gap-2">
              <Input
                inputMode="numeric"
                aria-label={`Spin points ${index + 1}`}
                value={String(slice.points)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    spin: current.spin.map((item, i) => (i === index ? { ...item, points: Number(event.target.value) } : item)),
                  }))
                }
              />
              <Input
                inputMode="numeric"
                aria-label={`Spin chance ${index + 1}`}
                value={String(slice.weight)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    spin: current.spin.map((item, i) => (i === index ? { ...item, weight: Number(event.target.value) } : item)),
                  }))
                }
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Left is points. Right is the chance. The chances have to add up to 100.</p>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" variant="gold" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </form>

      <ul className="mt-6 divide-y divide-border">
        {data.wallets.length === 0 ? <li className="py-3 text-sm text-muted-foreground">No wallet has bought $ZNZF for this drop yet.</li> : null}
        {data.wallets.map((row) => (
          <li key={row.wallet} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
            <span className="font-mono">{formatAddress(row.wallet)}</span>
            <span className="text-muted-foreground">
              {row.bought ? "bought" : "no buy"} · held {row.held} · {row.referrals} referrals
              {row.telegram ? " · room" : ""}
              {row.x ? " · X" : ""}
              {row.launched ? " · launch" : ""}
            </span>
            <span className="tabular-nums">{row.points} pts · {row.claim} $ZNZF</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toLocalInput(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ClaimGate({
  enabled,
  at,
  live,
  paused,
  onSaved,
}: {
  enabled: boolean;
  at: string;
  live: boolean;
  paused: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(enabled);
  const [when, setWhen] = useState(toLocalInput(at));
  useEffect(() => {
    setOpen(enabled);
    setWhen(toLocalInput(at));
  }, [enabled, at]);
  const save = useMutation({
    mutationFn: () =>
      saveClaimWindow({
        data: { open, opensAt: when ? new Date(when).toISOString() : "" },
      }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.open ? "Claims are open." : "Claims stay closed.");
        onSaved();
      }
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <form
      className="mt-6 rounded-2xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Open the split</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {live ? "Open. Shares are frozen from the points at open." : when ? "Waiting for the date. Points keep counting." : "Closed. Points keep counting."}
            {paused ? " Also paused on chain." : ""}
          </p>
        </div>
        <Switch checked={open} onCheckedChange={setOpen} aria-label="Open claims" />
      </div>
      <div className="mt-4 space-y-2">
        <Label htmlFor="claims-at">Open automatically at</Label>
        <Input id="claims-at" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        <p className="text-xs text-muted-foreground">
          Leave this empty to open as soon as the switch is on. A future time waits. Switch off keeps claims closed.
        </p>
      </div>
      <Button className="mt-4" type="submit" variant="gold" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
