import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { aiDesk, runAiPulse } from "@/lib/server/ai";

export const Route = createFileRoute("/arise/ai")({ component: AdminAi });

function AdminAi() {
  const q = useQuery({ queryKey: ["ai-desk"], queryFn: () => aiDesk(), retry: false });
  const pulse = useMutation({
    mutationFn: () => runAiPulse(),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success("Pulse ready.");
      void q.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const d = q.data;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DeepSeek Flash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live V4.1 Flash model, memory, and every job Capy ran — public reads and operator drafts.
          </p>
        </div>
        <Button variant="gold" disabled={pulse.isPending} onClick={() => pulse.mutate()}>
          {pulse.isPending ? "Asking…" : "Ask for a pulse"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active provider" value={d?.provider ?? "—"} />
        <Stat label="Model" value={d?.model || "—"} />
        <Stat label="Fallback" value={d?.fallback ?? "None"} />
      </div>

      {pulse.data && pulse.data.ok && (
        <div className="stone-card rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest pulse · {pulse.data.provider}</p>
          <p className="mt-2 text-sm leading-relaxed">{pulse.data.text}</p>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Memory</h2>
        {(!d?.memory || d.memory.length === 0) && (
          <p className="mt-2 text-sm text-muted-foreground">No learned style yet. Drafts from Marketing land here.</p>
        )}
        <ul className="mt-3 space-y-2">
          {d?.memory.map((m) => (
            <li key={m.id} className="rounded-xl border border-border px-3 py-2 text-sm">
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="uppercase">{m.kind}</span>
                <span>{timeAgo(m.created_at)}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{m.content}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Job log</h2>
        {(!d?.jobs || d.jobs.length === 0) && (
          <p className="mt-2 text-sm text-muted-foreground">No jobs yet. Pulse, marketing, or a public Capy read will appear here.</p>
        )}
        <ul className="mt-3 divide-y divide-border">
          {d?.jobs.map((j) => (
            <li key={j.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {j.provider} · {j.model} · {j.kind}
                </span>
                <span>
                  {j.status} · {timeAgo(j.created_at)}
                </span>
              </div>
              <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{j.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stone-card rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl">{value}</p>
    </div>
  );
}
