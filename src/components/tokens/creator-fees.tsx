import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { claimCreatorFeesCalldata } from "@/lib/contracts";
import { formatAddress, formatFixed } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
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
  const ticker = (snap.data?.symbol || token.symbol || "").replace(/^\$/, "").toUpperCase();
  const shortPay = creatorKnown ? formatAddress(payTo) : "";
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

  const protocol = snap.data?.protocol === true;
  const showClaim = hasCurve && claimable && !protocol;
  const label = claim.isPending
    ? "Claiming…"
    : claimableAmt <= 0
      ? "Nothing to claim yet"
      : !wallet.connected
        ? "Connect wallet to claim"
        : "Claim fees";

  return (
    <div className="stone-card rounded-xl p-4">
      <p className="text-sm font-medium">Creator fees</p>
      <p className="mt-1 font-display text-2xl tabular-nums">
        {formatFixed(earned, 6)} {unit}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {protocol
          ? "The 2% on this curve goes to the fee vault. There is no creator claim. A sweep can send 80% of the vault ETH to buyback. 20% stays in the vault."
          : !hasCurve
          ? `No bonding curve is live for $${ticker || "token"} yet.`
          : sweeps === 0 && claimableAmt <= 0
            ? `No fees earned on this $${ticker || "token"} curve yet.`
            : `Earned on this $${ticker || "token"} curve from ${sweeps} trade${sweeps === 1 ? "" : "s"}.`}
      </p>
      <p className="mt-4 font-display text-xl tabular-nums">
        {formatFixed(claimableAmt, 6)} {unit}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {protocol
          ? "Nothing on this curve is claimable by a creator."
          : showClaim
          ? shortPay
            ? `Claimable now on this curve · paid to ${shortPay}`
            : "Claimable now on this curve."
          : "Nothing is claimable until the curve is live."}
      </p>
      {hasCurve && snap.data?.claimable === false && !snap.data?.holderSharing && (
        <p className="mt-2 text-xs text-muted-foreground">
          This curve pays the creator share into that wallet as each swap confirms.
        </p>
      )}
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