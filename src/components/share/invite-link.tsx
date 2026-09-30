import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { myReferralCode } from "@/lib/server/referral";
import { useWallet } from "@/lib/wallet";

export function InviteLink() {
  const address = useWallet((s) => s.address);
  const q = useQuery({
    queryKey: ["referral-code", address],
    queryFn: () => myReferralCode({ data: { wallet: address ?? "" } }),
    enabled: Boolean(address),
  });
  const url = q.data && q.data.ok ? q.data.url : "";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium">Invite someone</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Share your link. A friend counts after they buy $ZNZF.
      </p>
      {url ? (
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            toast.success("Invite link copied.");
          }}
        >
          Copy invite link
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Connect a wallet to get your link.</p>
      )}
    </div>
  );
}
