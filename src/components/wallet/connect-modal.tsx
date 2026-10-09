import { toast } from "sonner";
import { openAppKitModalWhenReady } from "@/lib/appkit-bridge";
import { formatAddress } from "@/lib/format";
import { AddressIdenticon } from "@/lib/identicon";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

/** Header control. Reown AppKit is the only connect and account surface. */
export function ConnectWalletButton({ className }: { className?: string }) {
  const { connected, address, connecting, signed, signing, ensureSession } = useWallet();

  if (connected && address && !signed) {
    return (
      <button
        type="button"
        onClick={() => void ensureSession().catch(() => undefined)}
        disabled={signing}
        className={cn(
          "inline-flex h-11 max-w-[8.5rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-gold px-3 text-xs font-medium text-ink hover:opacity-92 sm:max-w-none",
          className,
        )}
      >
        {signing ? "Confirm…" : "Confirm"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void openAppKitModalWhenReady(connected ? "Account" : "Connect").then((opened) => {
          if (!opened) toast.error("Wallet is still loading. Try again.");
        });
      }}
      disabled={connecting}
      className={cn(
        "inline-flex h-11 max-w-[8.5rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-medium sm:max-w-none",
        connected ? "border border-border bg-card hover:bg-muted" : "bg-gold text-ink hover:opacity-92",
        className,
      )}
    >
      {connected && address ? (
        <>
          <AddressIdenticon address={address} className="size-5" />
          <span className="truncate font-mono">{formatAddress(address)}</span>
        </>
      ) : connecting ? (
        "Opening…"
      ) : (
        <span>Wallet</span>
      )}
    </button>
  );
}
