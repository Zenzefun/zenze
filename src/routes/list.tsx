import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ListingFields, listingSocials, useListingPool } from "@/components/tokens/listing-form";
import { Button } from "@/components/ui/button";
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
      description: "List a token that already trades in a Uniswap v4 pool. Website, X, Telegram, and the pool are saved with it.",
      path: "/list",
    }),
});

function vaultKey(chain: ChainKey) {
  return chain === "arc" ? "vault_arc" : "vault_robinhood";
}

function ListToken() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const cfg = useQuery({ queryKey: ["public-config"], queryFn: () => publicConfig(), initialData: publishedConfig() });
  const wallet = useWallet();
  const navigate = useNavigate();
  const [chain, setChain] = useState<ChainKey>("robinhood");
  const [contract, setContract] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const fees = useQuery({ queryKey: ["fee-quote", chain], queryFn: () => feeQuote({ data: { chain } }) });
  const pool = useListingPool(chain, contract);

  const vault = cfg.data?.[vaultKey(chain)];
  const vaultLive = Boolean(vault && /^0x[a-fA-F0-9]{40}$/.test(vault));

  const mut = useMutation({
    mutationFn: async () => {
      const note = description.trim();
      if (!note) throw new Error("Add a description.");
      const socials = listingSocials(website, twitter, telegram);
      if (!isTokenArt(imageUrl)) throw new Error("Upload a token image first.");
      if (!pool.data?.ok) throw new Error(pool.data && !pool.data.ok ? pool.data.error : "That contract has no pool yet.");
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
        data: { chain, contract, description: note, imageUrl: pinned.url, txHash: hash, ...socials, ...signed },
      });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (res) => {
      if (!res?.token) return;
      toast.success(`$${res.token.symbol} is listed from on-chain data.`);
      if (res.promo === "failed") toast.error(res.promoError || "Listed, but the X post did not go out.");
      navigate({ to: "/token/$id", params: { id: res.token.id } });
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-semibold">List a token that already trades</h1>
        <p className="mt-2 text-muted-foreground">
          Paste the contract. The Uniswap v4 ETH pool is read and shown before you pay. Website, X, and Telegram are saved on the token page.
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
          <Button type="submit" variant="gold" className="w-full" disabled={mut.isPending || !vaultLive}>
            {mut.isPending ? "Waiting on the wallet…" : wallet.connected ? "Confirm in wallet" : "Connect wallet to list"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
