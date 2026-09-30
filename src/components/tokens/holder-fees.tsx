import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { claimHolderFeesCalldata } from "@/lib/contracts";
import { formatAddress, formatFixed } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { isProtocolToken } from "@/lib/pool";
import { holderFeeSnapshot, prepareWalletTx, type EnrichedToken } from "@/lib/server/market";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";

function useHolderClaim(token: EnrichedToken) {
  const wallet = useWallet();
  const curve = token.curve_address;
  const snap = useQuery({
    queryKey: ["holder-fees", curve, token.chain.key, wallet.address],
    queryFn: () =>
      holderFeeSnapshot({
        data: { curve, chain: token.chain.key, wallet: wallet.address },
      }),
    enabled: Boolean(curve && isHexAddress(curve) && wallet.address),
    refetchInterval: 15_000,
  });
  const claim = useMutation({
    mutationFn: async () => {
      if (!curve || !isHexAddress(curve)) throw new Error("This pool has no curve.");
      if (!wallet.connected) await wallet.connect();
      if (wallet.chainId !== token.chain.id) await wallet.switchChain(token.chain.key);
      const from = wallet.address;
      if (!from) throw new Error("Connect a wallet first.");
      const data = claimHolderFeesCalldata();
      const prep = await prepareWalletTx({
        data: { chain: token.chain.key, from, to: curve, data, value: "0" },
      });
      if (!prep.ok) throw new Error(prep.error);
      const hash = await wallet.sendTransaction({ to: curve, data, ...txGas(prep) });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("Claim reverted.");
      return hash;
    },
    onSuccess: () => {
      toast.success("Holder fees sent to your wallet.");
      void snap.refetch();
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });
  return { wallet, snap, claim };
}

export function HolderFees({ token }: { token: EnrichedToken }) {
  if (isProtocolToken(token) || token.source === "listed" || !isHexAddress(token.curve_address)) return null;
  const { wallet, snap, claim } = useHolderClaim(token);
  const stored = Boolean(token.holder_sharing);
  const liveSharing = snap.data && snap.data.ok !== false ? Boolean(snap.data.sharing) : stored;
  const ticker = (token.symbol || "Token").replace(/^\$/, "").toUpperCase();
  const creator = token.creator_wallet && isHexAddress(token.creator_wallet) ? formatAddress(token.creator_wallet) : "";
  const unit = token.quote.native ? token.chain.gas : token.quote.symbol;
  const accrued = snap.data?.accrued ?? 0;

  if (!liveSharing) {
    return (
      <div className="stone-card rounded-xl p-4">
        <p className="text-sm font-medium">Holder fee sharing</p>
        <p className="mt-2 text-sm text-muted-foreground">
          ${ticker} pays its creator fees to {creator || "the creator wallet"}. Holder sharing is off, so that share stays with the creator. It is chosen at launch and cannot be changed after.
        </p>
      </div>
    );
  }

  return (
    <div className="stone-card rounded-xl p-4">
      <p className="text-sm font-medium">Holder fee sharing</p>
      <p className="mt-1 font-display text-2xl tabular-nums">
        {wallet.address ? `${formatFixed(accrued, 6)} ${unit}` : "—"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        ${ticker} splits its creator fees across holders. Claim your part on this page or in Portfolio.
      </p>
      {wallet.address ? (
        <Button
          className="mt-3 w-full"
          variant="gold"
          disabled={claim.isPending || accrued <= 0}
          onClick={() => claim.mutate()}
        >
          {claim.isPending ? "Claiming…" : accrued > 0 ? "Claim holder fees" : "Nothing to claim yet"}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Connect the wallet that holds this token to claim.</p>
      )}
    </div>
  );
}

export function HolderFeeClaimButton({ token }: { token: EnrichedToken }) {
  const { snap, claim } = useHolderClaim(token);
  if (!snap.data?.sharing) return null;
  const accrued = snap.data.accrued ?? 0;
  if (accrued <= 0) return null;
  return (
    <Button size="sm" variant="gold" disabled={claim.isPending} onClick={() => claim.mutate()}>
      {claim.isPending ? "Claiming…" : "Claim fees"}
    </Button>
  );
}