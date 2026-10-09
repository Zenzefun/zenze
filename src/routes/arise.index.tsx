import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { adminOverview } from "@/lib/server/admin";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/arise/")({ component: AdminHome });

function AdminHome() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminOverview(), retry: false });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Still counting.</p>;
  if (q.isError) {
    return (
      <p className="text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "The desk could not be read. Sign in again with the treasury wallet."}
      </p>
    );
  }
  if (!q.data || !q.data.ok) return <p className="text-sm text-muted-foreground">Sign in with the operator wallet to open the desk.</p>;
  const d = q.data;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">Live ledger from the protocol.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Tokens" value={String(d.tokens)} />
        <Stat label="Fees accrued" value={String(d.feesAccrued ?? 0)} />
        <Stat label="Withdrawals queued" value={String(d.pendingWithdrawals ?? 0)} />
        <Stat label="Marketing queued" value={String(d.queued)} />
        <Stat label="Operators" value={String(d.operators)} />
      </div>
      <div className="mt-6 rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">DeepSeek Flash</h2>
          <Link to="/arise/ai" className="text-sm text-stone underline">
            Open desk
          </Link>
        </div>
        {d.lastJob ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Last job: {d.lastJob.provider} · {d.lastJob.model} · {d.lastJob.kind} · {d.lastJob.status} · {timeAgo(d.lastJob.created_at)}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No jobs yet. Open DeepSeek Flash to run a pulse.</p>
        )}
      </div>
      <h2 className="mt-10 text-lg font-semibold">Audit log</h2>
      <ul className="mt-3 divide-y divide-border">
        {d.logs.length === 0 && <li className="py-4 text-sm text-muted-foreground">No ripples yet.</li>}
        {d.logs.map((l) => (
          <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span className="font-medium">{l.action}</span>
            <span className="break-all text-muted-foreground">{l.detail}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(l.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stone-card rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}
