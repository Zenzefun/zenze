import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { siteFunnel } from "@/lib/server/events";

export const Route = createFileRoute("/arise/funnel")({
  component: Funnel,
});

function Funnel() {
  const q = useQuery({ queryKey: ["site-funnel"], queryFn: () => siteFunnel(), retry: false });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading funnel…</p>;
  if (q.isError || !q.data?.ok) return <p className="text-sm text-destructive">Sign in with the operator wallet.</p>;
  const d = q.data;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Site funnel (7 days)</h1>
      <p className="mt-1 text-sm text-muted-foreground">First-party events. No IP or wallet.</p>
      <ul className="mt-6 space-y-2 text-sm">
        <li>pageview: {d.counts.pageview ?? 0}</li>
        <li>launch_form_start: {d.counts.launch_form_start ?? 0}</li>
        <li>launch_form_complete: {d.counts.launch_form_complete ?? 0}</li>
        <li>new tokens with UTM: {d.launchesWithUtm}</li>
      </ul>
      <h2 className="mt-6 text-lg font-semibold">Top campaigns</h2>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {d.campaigns.length === 0 && <li>None yet.</li>}
        {d.campaigns.map((c) => (
          <li key={c.campaign}>{c.campaign}: {c.n}</li>
        ))}
      </ul>
    </div>
  );
}
