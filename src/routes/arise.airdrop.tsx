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
          {q.error instanceof Error
            ? q.error.message
            : q.data && "error" in q.data && typeof q.data.error === "string"
              ? q.data.error
              : "The desk could not read the drop. Sign in again with the treasury wallet."}
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
  const ready = data.wallets.filter((row) => row.ready);
  const pointsIn = ready.reduce((sum, row) => sum + row.points, 0);
  const minHold = data.rules.minHold.toLocaleString("en-US");
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
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Drop</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        The public page uses this same sum. A wallet counts only after it buys $ZNZF and still holds {minHold}. Share = that wallet's points ÷ these points × today's pool balance. More points make each share smaller.
      </p>
      <ClaimGate
        enabled={data.claimsEnabled}
        at={data.claimsAt}
        live={data.claimsOpen && !data.paused}
        paused={data.paused}
        onSaved={onSaved}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Still in the pool" value={`${data.balance} $ZNZF`} />
        <Stat label="In the split" value={`${ready.length} wallets`} />
        <Stat label="Points in the split" value={pointsIn.toLocaleString("en-US")} />
        <Stat label="Contract" value={data.pool ? formatAddress(data.pool) : "Not deployed"} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Funded {data.funded} · claimed {data.claimed}. Signer {data.signer ? "ready" : "missing"}.
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

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Wallet</th>
              <th className="py-2 pr-3 font-medium">Holds</th>
              <th className="py-2 pr-3 font-medium">Points</th>
              <th className="py-2 pr-3 font-medium">On today's balance</th>
              <th className="py-2 pr-3 font-medium">Frozen</th>
              <th className="py-2 font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {data.wallets.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={6}>No wallet has bought $ZNZF for this drop yet.</td>
              </tr>
            ) : null}
            {data.wallets.map((row) => (
              <tr key={row.wallet} className="border-t border-border">
                <td className="py-3 pr-3 font-mono">{formatAddress(row.wallet)}</td>
                <td className="py-3 pr-3 tabular-nums">{row.held}</td>
                <td className="py-3 pr-3 tabular-nums">{row.ready ? row.points : "—"}</td>
                <td className="py-3 pr-3 tabular-nums">{row.ready ? wholeShare(row.points, pointsIn, data.balance) : "—"}</td>
                <td className="py-3 pr-3 tabular-nums">{data.claimsOpen ? row.claim : "—"}</td>
                <td className="py-3 text-muted-foreground">
                  {row.ready ? "In the split" : row.bought ? "Under the hold" : "No buy"}
                  {row.telegram ? " · room" : ""}
                  {row.x ? " · X" : ""}
                  {row.launched ? " · launch" : ""}
                  {row.referrals ? ` · ${row.referrals} friends` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function wholeShare(points: number, total: number, pool: string) {
  const left = Number(pool.replace(/,/g, "")) || 0;
  if (points <= 0 || total <= 0 || left <= 0) return "0";
  return Math.floor((left * points) / total).toLocaleString("en-US");
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
