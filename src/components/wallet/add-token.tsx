import { useState } from "react";
import { toast } from "sonner";
import { ChainMark } from "@/components/chains/chain-mark";
import { Button } from "@/components/ui/button";
import type { ChainKey } from "@/lib/chains";
import { cleanTokenName, cleanTokenSymbol } from "@/lib/token-name";
import { displayTokenArt } from "@/lib/image-art";
import { useWallet } from "@/lib/wallet";
import { ZNZF_IPFS_GATEWAY } from "@/lib/znzf-image";
import { cn } from "@/lib/utils";

export function AddTokenButton({
  address,
  symbol,
  name,
  decimals = 18,
  image,
  chain,
  label,
  variant = "outline",
  size = "sm",
  className,
}: {
  address: string | null | undefined;
  symbol: string;
  name?: string | null;
  decimals?: number;
  image?: string | null;
  chain: ChainKey;
  label?: string;
  variant?: "outline" | "gold" | "default";
  size?: "sm" | "default";
  className?: string;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const ticker = cleanTokenSymbol(symbol) || "TOKEN";
  const tokenName = cleanTokenName(name, ticker);

  async function add() {
    if (!address) {
      toast.error("This token has no contract yet.");
      return;
    }
    try {
      setBusy(true);
      if (!wallet.connected) await wallet.connect();
      const img = image ? displayTokenArt(image) : undefined;
      await wallet.watchAsset({
        chain,
        address,
        symbol: ticker,
        name: tokenName,
        decimals,
        image: img,
      });
      toast.success(`${tokenName} ($${ticker}) added to your wallet.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet did not add the token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} disabled={!address || busy} onClick={() => void add()} className={cn(className)}>
      {busy ? "Waiting for wallet…" : label ?? `Add $${ticker}`}
    </Button>
  );
}

export function AddZnzfToWallet({
  robinhood,
  arc,
  image,
}: {
  robinhood: string | null;
  arc: string | null;
  image?: string | null;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState<"robinhood" | "arc" | null>(null);
  const mark = image && (/^https?:\/\//i.test(image) || image.includes("/ipfs/"))
    ? image.startsWith("ipfs://")
      ? ZNZF_IPFS_GATEWAY
      : image
    : ZNZF_IPFS_GATEWAY;

  async function add(chain: "robinhood" | "arc") {
    const address = chain === "robinhood" ? robinhood : arc;
    if (!address) {
      toast.error("$ZNZF is not available on that chain yet.");
      return;
    }
    try {
      setBusy(chain);
      if (!wallet.connected) await wallet.connect();
      await wallet.watchAsset({
        chain,
        address,
        symbol: "ZNZF",
        name: chain === "arc" ? "Zenze (Bridged)" : "Zenze",
        decimals: 18,
        image: mark,
      });
      toast.success(chain === "arc" ? "Bridged Zenze ($ZNZF) added to your wallet." : "Zenze ($ZNZF) added to your wallet.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wallet did not add the token.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="gold" disabled={!robinhood || busy !== null} onClick={() => void add("robinhood")}>
        <ChainMark chain="robinhood" className="size-4" />
        {busy === "robinhood" ? "Waiting for wallet…" : "Add $ZNZF"}
      </Button>
      {arc ? (
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void add("arc")}>
          <ChainMark chain="arc" className="size-4" />
          {busy === "arc" ? "Waiting for wallet…" : "Add bridged $ZNZF"}
        </Button>
      ) : null}
    </div>
  );
}
