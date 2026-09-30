import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { formatAddress, formatCompact, timeAgo } from "@/lib/format";
import { draftProposal } from "@/lib/server/ai";
import { createProposal, governancePage, protocolStats, voteProposal } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { publicWalletError, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/governance")({
  component: Governance,
  head: () =>
    pageHead({
      title: "Governance",
      description: "Lock $ZNZF and you can speak. A balance left in the wallet does not vote. A proposal is how the room decides.",
      path: "/governance",
    }),
});

function Governance() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const page = useQuery({ queryKey: ["governance"], queryFn: () => governancePage() });
  const wallet = useWallet();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hint, setHint] = useState("");
  const [source, setSource] = useState<"wallet" | "ai">("wallet");

  const draft = useMutation({
    mutationFn: () => draftProposal({ data: { hint } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTitle(res.title);
      setBody(res.body);
      setSource("ai");
      toast.success("Capy drafted from live desk facts. Read it, then sign to submit.");
    },
    onError: () => toast.error("Capy could not draft just now."),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!wallet.connected) await wallet.connect();
      if (!wallet.signed) await wallet.ensureSession();
      const signed = await wallet.signIntent({ action: "propose", tokenId: "governance", amount: title.trim() });
      const res = await createProposal({ data: { title, body, source, ...signed } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: async () => {
      toast.success("Proposal is open.");
      setTitle("");
      setBody("");
      setHint("");
      setSource("wallet");
      await page.refetch();
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  const vote = useMutation({
    mutationFn: async (input: { id: number; support: boolean }) => {
      if (!wallet.connected) await wallet.connect();
      if (!wallet.signed) await wallet.ensureSession();
      const signed = await wallet.signIntent({
        action: "vote",
        tokenId: String(input.id),
        amount: input.support ? "yes" : "no",
      });
      const res = await voteProposal({ data: { ...input, ...signed } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: async () => {
      toast.success("Vote recorded.");
      await page.refetch();
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">
          <Link to="/znzf" className="hover:underline">
            $ZNZF
          </Link>{" "}
          · Governance
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Your say</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
          Lock $ZNZF and you can speak. A balance left in the wallet does not vote.
        </p>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          A proposal is how this room decides. The more you lock, the heavier your vote.
        </p>

        <section className="mt-8 stone-card rounded-xl p-5">
          <h2 className="text-lg font-semibold">Open a proposal</h2>
          <Input
            className="mt-4"
            placeholder="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSource("wallet");
            }}
          />
          <Textarea
            className="mt-3 min-h-32"
            placeholder="What should change, and how we will know it worked."
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSource("wallet");
            }}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Optional hint for Capy" value={hint} onChange={(e) => setHint(e.target.value)} />
            <Button variant="outline" disabled={draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? "Capy is reading the desk…" : "Ask Capy to draft"}
            </Button>
          </div>
          <Button
            className="mt-4 w-full"
            variant="gold"
            disabled={submit.isPending || title.trim().length < 8 || body.trim().length < 24}
            onClick={() => submit.mutate()}
          >
            {!wallet.connected ? "Connect wallet to propose" : !wallet.signed ? "Sign in to propose" : submit.isPending ? "Waiting for signature…" : "Submit proposal"}
          </Button>
        </section>

        <ul className="mt-8 space-y-4">
          {(page.data?.proposals ?? []).length === 0 && (
            <li className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No proposals yet.</li>
          )}
          {(page.data?.proposals ?? []).map((p) => {
            const total = p.yes + p.no;
            const yesPct = total > 0 ? (p.yes / total) * 100 : 0;
            return (
              <li key={p.id} className="stone-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {p.proposer ? formatAddress(p.proposer) : "Desk"} · {p.source === "ai" ? "Capy draft" : "Wallet"} · {timeAgo(p.created_at)}
                    </p>
                  </div>
                  <Badge variant={p.status === "open" ? "moss" : "outline"}>{p.status}</Badge>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>Yes {formatCompact(p.yes)}</span>
                    <span>No {formatCompact(p.no)}</span>
                  </div>
                  <Progress value={yesPct} />
                </div>
                {p.status === "open" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="gold" disabled={vote.isPending} onClick={() => vote.mutate({ id: p.id, support: true })}>
                      Vote yes
                    </Button>
                    <Button size="sm" variant="outline" disabled={vote.isPending} onClick={() => vote.mutate({ id: p.id, support: false })}>
                      Vote no
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
