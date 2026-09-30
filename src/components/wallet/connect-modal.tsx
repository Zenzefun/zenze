import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openAppKitModalWhenReady } from "@/lib/appkit-bridge";
import { formatAddress, formatEth } from "@/lib/format";
import { AddressIdenticon } from "@/lib/identicon";
import { cn } from "@/lib/utils";
import { nativeSymbol, networkLabel, useWallet } from "@/lib/wallet";
import { chainById } from "@/lib/chains";

export function ConnectModal({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const storeOpen = useWallet((s) => s.connectModalOpen);
  const close = useWallet((s) => s.closeConnectModal);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : storeOpen;
  function setOpen(v: boolean) {
    if (controlled) onOpenChange?.(v);
    else close();
  }

  const { connected, address, native, chainId, walletName, disconnect, signed, signing, ensureSession } = useWallet();
  const [copied, setCopied] = useState(false);

  async function copyAddr() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy address.");
    }
  }

  if (!connected || !address) return null;
  const explorer = chainById(chainId)?.explorer;
  const gas = nativeSymbol(chainId);
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-[400px] p-0 sm:rounded-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Connected wallet on this device.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center px-6 pb-2">
          <AddressIdenticon address={address} className="size-16" />
          <p className="mt-3 font-mono text-lg font-semibold tracking-tight">{formatAddress(address)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatEth(native)} {gas} · {networkLabel(chainId)}
          </p>
          {walletName && <p className="mt-0.5 text-xs text-muted-foreground">{walletName}</p>}
          {!signed && (
            <Button className="mt-3 w-full" variant="gold" disabled={signing} onClick={() => void ensureSession()}>
              {signing ? "Waiting for signature…" : "Sign in with this wallet"}
            </Button>
          )}
          {signed && <p className="mt-2 text-xs text-moss">Signed in · no gas</p>}
          <div className="mt-4 flex w-full gap-2">
            <Button variant="outline" className="flex-1" onClick={() => void copyAddr()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            {explorer && (
              <Button asChild variant="outline" className="flex-1">
                <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Explorer
                </a>
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-2 border-t border-border px-6 py-4">
          <Button asChild variant="secondary" className="flex-1">
            <a href="/portfolio">Portfolio</a>
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
          >
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
