import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listAdminTokens } from "@/lib/server/admin";
import { reviewTokenArt } from "@/lib/server/ai";
import { asNumber, formatCompact } from "@/lib/format";

export const Route = createFileRoute("/arise/tokens")({ component: AdminTokens });

function AdminTokens() {
  const q = useQuery({ queryKey: ["admin-tokens"], queryFn: () => listAdminTokens(), retry: false });
  const rows = q.data ?? [];
  const [looking, setLooking] = useState<string | null>(null);
  const [review, setReview] = useState<{ id: string; text: string } | null>(null);
  const look = useMutation({
    mutationFn: (id: string) => reviewTokenArt({ data: { id } }),
    onMutate: (id) => setLooking(id),
    onSuccess: (res, id) => {
      if (!res.ok) toast.error(res.error);
      else {
        setReview({ id, text: res.text });
        toast.success("Capy looked.");
      }
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setLooking(null),
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tokens</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ledger plus Capy vision — DeepSeek Flash looks at launch art.
          </p>
        </div>
      </div>
      {review ? (
        <div className="stone-card mt-4 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Capy on this canvas</p>
          <p className="mt-2 text-sm leading-relaxed">{review.text}</p>
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Token</th>
              <th>Chain</th>
              <th>Holders</th>
              <th>Health</th>
              <th>Vol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-muted-foreground" colSpan={6}>
                  No tokens in the ledger yet.
                </td>
              </tr>
            )}
            {rows.map((t) => (
              <tr key={String(t.id)} className="border-t border-border">
                <td className="py-3 font-medium">
                  ${t.symbol} · {t.name}
                </td>
                <td>{t.chain}</td>
                <td className="tabular-nums">{t.holders}</td>
                <td className="tabular-nums">{t.health_score}</td>
                <td className="tabular-nums">{formatCompact(asNumber(t.volume_24h))}</td>
                <td className="whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="mr-2"
                    disabled={looking === t.id}
                    onClick={() => look.mutate(t.id)}
                  >
                    {looking === t.id ? "Looking…" : "Capy look"}
                  </Button>
                  <Link className="text-stone underline" to="/token/$id" params={{ id: t.id }}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
