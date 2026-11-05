import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startXOauth, xLinkStatus, xOAuthReady } from "@/lib/server/x-oauth-api";

export function ConnectX({ wallet }: { wallet: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const ready = useQuery({
    queryKey: ["x-oauth-ready"],
    queryFn: () => xOAuthReady(),
    staleTime: 60_000,
  });

  const status = useQuery({
    queryKey: ["x-link", wallet],
    queryFn: () => xLinkStatus({ data: { wallet } }),
    enabled: Boolean(wallet),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const x = params.get("x");
    if (!x) return;
    const reason = params.get("reason");
    if (x === "ok") {
      const handle = params.get("handle");
      toast.success(handle ? `Connected @${handle}` : "X connected");
      void qc.invalidateQueries({ queryKey: ["x-link", wallet] });
    } else if (x === "error") {
      toast.error(reason || "Could not connect X");
    }
    params.delete("x");
    params.delete("handle");
    params.delete("reason");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `?${next}` : window.location.pathname);
  }, [qc, wallet]);

  if (!ready.data?.ready) return null;

  const handle = status.data?.handle;
  const follows = status.data?.follows;

  async function onConnect() {
    setBusy(true);
    try {
      const res = await startXOauth({ data: { wallet } });
      if (!res.ok) {
        toast.error(res.error || "Could not start X connect");
        return;
      }
      window.location.href = res.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start X connect");
    } finally {
      setBusy(false);
    }
  }

  if (handle) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
        <span className="text-muted-foreground">X</span>{" "}
        <span className="font-medium">@{handle}</span>
        <span className="ml-2 text-muted-foreground">
          {follows ? "following" : "not following"}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void onConnect()}>
        {busy ? "Connecting…" : "Connect X"}
      </Button>
    </div>
  );
}
