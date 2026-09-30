import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ArtPicker } from "@/components/tokens/art-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChainSelect } from "@/components/chains/chain-select";
import { CHAINS, type ChainKey } from "@/lib/chains";
import { isTokenArt } from "@/lib/image-art";
import { publishedConfig } from "@/lib/onchain";
import { feeQuote, listExternalToken, pinLaunchArt, prepareWalletTx, protocolStats, publicConfig } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/list")({
  component: ListToken,
  head: () =>
    pageHead({
      title: "List a token",
      description: "Already have a token? List it so buyers can find it here.",
      path: "/list",
    }),
});

function vaultKey(chain: ChainKey) {
  return chain === "arc" ? "vault_arc" : "vault_robinhood";
}

function ListToken() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const cfg = useQuery({ queryKey: ["public-config"], queryFn: () => publicConfig(), initialData: publishedConfig() });
  const search = useSearch({ strict: false }) as { ref?: string };
  const wallet = useWallet();
  const navigate = useNavigate();
  const [chain, setChain] = useState<ChainKey>("robinhood");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [referrer, setReferrer] = useState(search.ref ?? "");
  const [imageUrl, setImageUrl] = useState("");
  const fees = useQuery({ queryKey: ["fee-quote", chain], queryFn: () => feeQuote({ data: { chain } }) });

  const vault = cfg.data?.[vaultKey(chain)];
  const vaultLive = Boolean(vault && /^0x[a-fA-F0-9]{40}$/.test(vault));

  const mut = useMutation({
    mutationFn: async () => {
      if (!isTokenArt(imageUrl)) throw new Error("Upload a token image first.");
      if (!vaultLive) throw new Error("Listing is not open on this chain right now.");
      if (!wallet.connected) await wallet.connect();
      if (wallet.chainId !== CHAINS[chain].id) await wallet.switchChain(chain);
      const pinned = await pinLaunchArt({ data: { imageUrl } });
      if (!pinned.ok) throw new Error(pinned.error);
      const quoteFees = fees.data ?? (await feeQuote({ data: { chain } }));
      const from = wallet.address;
      if (!from) throw new Error("Connect a wallet first.");
      const value = BigInt(quoteFees.listWei);
      const prep = await prepareWalletTx({
        data: { chain, from, to: vault, data: "0x", value: value.toString() },
      });
      if (!prep.ok) throw new Error(prep.error);
      const hash = await wallet.sendTransaction({
        to: vault,
        data: "0x",
        value,
        ...txGas(prep),
      });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("Payment transaction reverted.");
      const signed = await wallet.signIntent({ action: "list", tokenId: contract.trim(), amount: String(quoteFees.listUsd) });
      const res = await listExternalToken({
        data: { chain, contract, description, imageUrl: pinned.url, referrer, txHash: hash, ...signed },
      });
      if (!res.ok) throw new Error(res.error);
      return res.token;
    },
    onSuccess: (token) => {
      if (!token) return;
      toast.success(`$${token.symbol} is listed from on-chain data.`);
      navigate({ to: "/token/$id", params: { id: token.id } });
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-semibold">List a token you already have</h1>
        <p className="mt-2 text-muted-foreground">
          Paste the contract. The name and the supply come from the chain, and buyers can find it here.
        </p>
        {!vaultLive && (
          <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            Listing is not open on {CHAINS[chain].name} right now. Try the other network.
          </p>
        )}
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Chain</Label>
            <ChainSelect value={chain} onChange={setChain} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca">Contract</Label>
            <Input id="ca" required value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0x…" className="font-mono" />
          </div>
          <ArtPicker value={imageUrl} onChange={setImageUrl} />
          <div className="space-y-2">
            <Label htmlFor="desc">Note (optional)</Label>
            <Textarea id="desc" maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref">Referrer wallet (optional)</Label>
            <Input id="ref" value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="0x…" className="font-mono" />
          </div>
          <Button type="submit" variant="gold" className="w-full" disabled={mut.isPending || !vaultLive}>
            {mut.isPending ? "Waiting on the wallet…" : wallet.connected ? "Confirm in wallet" : "Connect wallet to list"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
