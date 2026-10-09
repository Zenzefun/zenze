import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { CapyReadView } from "@/components/capy/capy-read";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adviseTrade, analyzeToken } from "@/lib/server/ai";
import { listTokens, protocolStats } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/capyai")({
  component: AiLab,
  head: () =>
    pageHead({
      title: "Capy AI",
      description: "Ask before you buy. Capy reads the pool you pick and stays quiet until you ask.",
      path: "/capyai",
    }),
});

function AiLab() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const tokens = useQuery({ queryKey: ["tokens"], queryFn: () => listTokens() });
  const pools = tokens.data ?? [];
  const [tokenId, setTokenId] = useState("");
  const selected = tokenId || pools[0]?.id || "";
  const [question, setQuestion] = useState("What should I look at before I buy?");
  const analyze = useMutation({ mutationFn: () => analyzeToken({ data: { id: selected } }) });
  const advise = useMutation({ mutationFn: () => adviseTrade({ data: { question, tokenId: selected || undefined } }) });

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Capy AI</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Pick a pool. Ask when you want the numbers in words. Nothing here posts for you.</p>
        <div className="mt-6">
          <Label htmlFor="tok">Pool</Label>
          <select
            id="tok"
            className="mt-2 h-11 w-full max-w-sm rounded-md border border-input bg-cream px-3 text-sm"
            value={selected}
            onChange={(e) => setTokenId(e.target.value)}
            disabled={pools.length === 0}
          >
            {pools.length === 0 && <option value="">No pools yet</option>}
            {pools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (${t.symbol})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Panel title="Read the pool" action="Read this pool" pending={analyze.isPending} disabled={!selected} onRun={() => analyze.mutate()}>
            {analyze.data && analyze.data.ok && analyze.data.lines ? (
              <CapyReadView lines={analyze.data.lines} note={analyze.data.note ?? analyze.data.summary} />
            ) : analyze.data && analyze.data.ok ? (
              <p className="text-sm leading-relaxed">{analyze.data.summary}</p>
            ) : null}
            {analyze.data && !analyze.data.ok && <p className="text-sm text-destructive">{analyze.data.error}</p>}
          </Panel>
          <Panel title="Ask a question" action="Ask" pending={advise.isPending} disabled={!selected} onRun={() => advise.mutate()}>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} className="mb-3" />
            {advise.data && advise.data.ok && <p className="text-sm leading-relaxed">{advise.data.text}</p>}
            {advise.data && !advise.data.ok && <p className="text-sm text-destructive">{advise.data.error}</p>}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Panel({
  title,
  action,
  pending,
  disabled,
  onRun,
  children,
}: {
  title: string;
  action: string;
  pending: boolean;
  disabled?: boolean;
  onRun: () => void;
  children: ReactNode;
}) {
  return (
    <div className="stone-card rounded-xl p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
      <Button className="mt-4" variant="outline" disabled={pending || disabled} onClick={onRun}>
        {pending ? "Reading…" : action}
      </Button>
    </div>
  );
}
