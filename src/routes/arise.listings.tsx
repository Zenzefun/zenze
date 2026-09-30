import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ChainSelect } from "@/components/chains/chain-select";
import { ArtPicker } from "@/components/tokens/art-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChainKey } from "@/lib/chains";
import { formatAddress } from "@/lib/format";
import { isTokenArt } from "@/lib/image-art";
import { listAdminTokens } from "@/lib/server/admin";
import { deskIndexToken } from "@/lib/server/market";

export const Route = createFileRoute("/arise/listings")({ component: AdminListings });

function AdminListings() {
  const q = useQuery({ queryKey: ["admin-tokens"], queryFn: () => listAdminTokens() });
  const rows = (q.data ?? []).filter((t) => t.source === "listed");
  const [chain, setChain] = useState<ChainKey>("robinhood");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!isTokenArt(imageUrl)) throw new Error("Upload a token image.");
      const res = await deskIndexToken({ data: { chain, contract, description, imageUrl } });
      if (!res.ok) throw new Error(res.error);
      return res.token;
    },
    onSuccess: (token) => {
      if (!token) return;
      toast.success(`$${token.symbol} indexed with no take.`);
      setContract("");
      setDescription("");
      setImageUrl("");
      void q.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not index that contract."),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Listings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Public /list still collects the on-chain take. The desk can index a contract with no take.
      </p>

      <form
        className="mt-6 max-w-xl space-y-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
      >
        <p className="text-sm font-medium">Index without a take</p>
        <div className="space-y-2">
          <Label>Chain</Label>
          <ChainSelect value={chain} onChange={setChain} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desk-ca">Contract</Label>
          <Input id="desk-ca" required value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0x…" className="font-mono" />
        </div>
        <ArtPicker value={imageUrl} onChange={setImageUrl} />
        <div className="space-y-2">
          <Label htmlFor="desk-note">Note (optional)</Label>
          <Textarea id="desk-note" maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button type="submit" variant="gold" disabled={mut.isPending}>
          {mut.isPending ? "Reading the contract…" : "Index token"}
        </Button>
      </form>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2">Token</th>
              <th>Chain</th>
              <th>Contract</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td className="py-6 text-muted-foreground" colSpan={4}>No external listings yet.</td></tr>
            )}
            {rows.map((t) => (
              <tr key={String(t.id)} className="border-t border-border">
                <td className="py-3 font-medium">${t.symbol} · {t.name}</td>
                <td>{t.chain}</td>
                <td className="font-mono text-xs">{t.contract_address ? formatAddress(t.contract_address) : "—"}</td>
                <td>
                  <Link className="text-stone underline" to="/token/$id" params={{ id: t.id }}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
