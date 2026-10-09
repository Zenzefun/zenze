import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ListingFields, listingSocials } from "@/components/tokens/listing-form";
import { Button } from "@/components/ui/button";
import type { ChainKey } from "@/lib/chains";
import { parseDexPool } from "@/lib/dex-swap";
import { formatAddress } from "@/lib/format";
import { isTokenArt } from "@/lib/image-art";
import { listAdminTokens } from "@/lib/server/admin";
import { deskIndexToken } from "@/lib/server/market";

export const Route = createFileRoute("/arise/listings")({ component: AdminListings });

function hostLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const path = new URL(url).pathname.replace(/^\//, "");
    if (host === "x.com" || host === "t.me") return path ? `@${path.split("/")[0]}` : host;
    return host;
  } catch {
    return url;
  }
}

function AdminListings() {
  const q = useQuery({ queryKey: ["admin-tokens"], queryFn: () => listAdminTokens() });
  const rows = (q.data ?? []).filter((t) => t.source === "listed");
  const [chain, setChain] = useState<ChainKey>("robinhood");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      if (!description.trim()) throw new Error("Add a description.");
      const socials = listingSocials(website, twitter, telegram);
      if (!isTokenArt(imageUrl)) throw new Error("Upload a token image.");
      const res = await deskIndexToken({ data: { chain, contract, description, imageUrl, ...socials } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if (!res?.token) return;
      toast.success(`$${res.token.symbol} indexed with no take.`);
      if (res.promo === "failed") toast.error(res.promoError || "The X post did not go out.");
      setContract("");
      setDescription("");
      setImageUrl("");
      setWebsite("");
      setTwitter("");
      setTelegram("");
      void q.refetch();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not index that contract."),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold">Listings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Same fields as the public list. The desk indexes the contract with no take. Website, X, Telegram, and the pool are saved.
      </p>

      <form
        className="mt-6 max-w-xl space-y-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
      >
        <p className="text-sm font-medium">Index without a take</p>
        <ListingFields
          chain={chain}
          onChain={setChain}
          contract={contract}
          onContract={setContract}
          imageUrl={imageUrl}
          onImage={setImageUrl}
          description={description}
          onDescription={setDescription}
          website={website}
          onWebsite={setWebsite}
          twitter={twitter}
          onTwitter={setTwitter}
          telegram={telegram}
          onTelegram={setTelegram}
        />
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
              <th>Website</th>
              <th>X</th>
              <th>Telegram</th>
              <th>Pool</th>
              <th>X post</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td className="py-6 text-muted-foreground" colSpan={9}>No external listings yet.</td></tr>
            )}
            {rows.map((t) => {
              const pool = parseDexPool(t.dex_pool);
              return (
                <tr key={String(t.id)} className="border-t border-border">
                  <td className="py-3 font-medium">${t.symbol} · {t.name}</td>
                  <td>{t.chain}</td>
                  <td className="font-mono text-xs">{t.contract_address ? formatAddress(t.contract_address) : "—"}</td>
                  <td>{t.website ? <a className="underline" href={t.website} target="_blank" rel="noopener noreferrer">{hostLabel(t.website)}</a> : "—"}</td>
                  <td>{t.twitter ? <a className="underline" href={t.twitter} target="_blank" rel="noopener noreferrer">{hostLabel(t.twitter)}</a> : "—"}</td>
                  <td>{t.telegram ? <a className="underline" href={t.telegram} target="_blank" rel="noopener noreferrer">{hostLabel(t.telegram)}</a> : "—"}</td>
                  <td className="font-mono text-xs">{pool ? formatAddress(pool.poolId) : "—"}</td>
                  <td className="text-xs">
                    {t.promo_status === "posted" ? "Posted" : t.promo_status === "failed" ? (t.promo_error || "Not posted") : "—"}
                  </td>
                  <td>
                    <Link className="text-stone underline" to="/token/$id" params={{ id: t.id }}>View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
