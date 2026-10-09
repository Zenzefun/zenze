import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { claimCreatorFeesCalldata } from "@/lib/contracts";
import { formatFixed } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { isProtocolToken } from "@/lib/pool";
import { creatorFeeSnapshot, prepareWalletTx, type EnrichedToken } from "@/lib/server/market";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";

export function CreatorFees({ token }: { token: EnrichedToken }) {
  const wallet = useWallet();
  const curve = token.curve_address;
  const snap = useQuery({
    queryKey: ["creator-fees", curve, token.chain.key, token.id],
    queryFn: () => creatorFeeSnapshot({ data: { curve, chain: token.chain.key, tokenId: token.id } }),
    refetchInterval: 15_000,
  });

  const unit = token.quote.native ? token.chain.gas : token.quote.symbol;
  const earned = snap.data?.earned ?? 0;
  const claimable = snap.data?.claimable === true;
  const claimableAmt = claimable ? snap.data?.accrued ?? 0 : 0;
  const sweeps = snap.data?.sweeps ?? 0;
  const payTo = (snap.data?.creator || token.creator_wallet || "").toLowerCase();
  const creatorKnown = isHexAddress(payTo) && !/^0x0{40}$/.test(payTo);
  const isCreator = Boolean(wallet.address) && creatorKnown && wallet.address?.toLowerCase() === payTo;
  const hasCurve = Boolean(curve && isHexAddress(curve));

  const claim = useMutation({
    mutationFn: async () => {
      if (!hasCurve || !curve) throw new Error("This pool has no curve.");
      if (!creatorKnown) throw new Error("This curve has no creator wallet.");
      if (!wallet.connected) await wallet.connect();
      if (wallet.chainId !== token.chain.id) await wallet.switchChain(token.chain.key);
      const from = wallet.address;
      if (!from) throw new Error("Connect a wallet first.");
      if (from.toLowerCase() !== payTo) throw new Error("Connect the creator wallet to claim.");
      const data = claimCreatorFeesCalldata();
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
      toast.success("Creator fees sent to your wallet.");
      void snap.refetch();
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  const protocol = isProtocolToken(token) || snap.data?.protocol === true;
  const sharedWithHolders = snap.data?.holderSharing === true && !protocol;
  const showClaim = hasCurve && claimable && !protocol && !sharedWithHolders;
  const label = claim.isPending
    ? "Claiming…"
    : claimableAmt <= 0
      ? "Nothing to claim yet"
      : !wallet.connected
        ? "Connect wallet to claim"
        : "Claim fees";

  const note = protocol
    ? "No creator fee. The 2% trade fee stays with Zenzen."
    : sharedWithHolders
      ? "The creator's part of the 2% fee is shared with holders."
      : !hasCurve
        ? "No fees yet."
        : snap.data?.claimable === false
          ? "Paid to the creator on each trade."
          : sweeps === 0 && claimableAmt <= 0
            ? "No creator fee earned yet."
            : "Part of the 2% trade fee. Not an extra charge.";

  return (
    <div className="stone-card rounded-xl p-4">
      <p className="text-sm font-medium">Creator fees</p>
      <p className="mt-1 font-display text-2xl tabular-nums">
        {protocol ? "None" : sharedWithHolders ? "Holders" : `${formatFixed(earned, 6)} ${unit}`}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
      {showClaim && (
        <Button
          className="mt-3 w-full"
          variant="gold"
          disabled={claim.isPending || claimableAmt <= 0}
          onClick={() => claim.mutate()}
        >
          {label}
        </Button>
      )}
      {showClaim && wallet.connected && !isCreator && (
        <p className="mt-3 text-xs text-muted-foreground">Connect the creator wallet to claim.</p>
      )}
    </div>
  );
}