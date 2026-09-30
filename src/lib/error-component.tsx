import { useEffect, useRef } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { HomeButton } from "@/components/site/home-button";
import { SmartImage } from "@/components/media/smart-image";
import { chunkErrorCopy, isChunkLoadError, reloadOnceForChunkError } from "./chunk-error";
import { isDummyError } from "./wallet";

const FALLBACK_MESSAGE = "Something went sideways. Reload the page and try again.";

function errorMessage(error: unknown): string {
  const chunk = chunkErrorCopy(error);
  if (chunk) return chunk;
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return FALLBACK_MESSAGE;
  if (isDummyError(error) || /dummy|mock|stub|not implemented/i.test(raw)) {
    return "Connect a wallet on this device, then reload.";
  }
  return raw;
}

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  const dummy = isDummyError(error) || /dummy|mock|stub|not implemented/i.test(errorMessage(error));
  const chunk = isChunkLoadError(error);
  const retried = useRef(false);

  useEffect(() => {
    if (retried.current) return;
    if (dummy) {
      retried.current = true;
      reset();
      return;
    }
    if (chunk) {
      retried.current = true;
      reloadOnceForChunkError();
    }
  }, [dummy, chunk, reset]);

  if (dummy) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 text-center text-foreground">
        <div className="steam-veil pointer-events-none absolute inset-0" />
        <div className="relative page-enter">
          <SmartImage src="/brand/capy-sleep.webp" alt="" width={320} height={240} className="mx-auto w-44 rounded-2xl object-cover capy-bob" rounded="2xl" />
          <h1 className="mt-6 font-display text-lg font-semibold">Connect a wallet to continue</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Use MetaMask, Rabby, Coinbase Wallet, or WalletConnect, then reload.
          </p>
          <div className="mt-6 flex justify-center">
            <HomeButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 text-center text-foreground">
      <div className="steam-veil pointer-events-none absolute inset-0" />
      <div className="relative page-enter">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone stagger-item">Error</p>
        <SmartImage src="/brand/capy-zen.webp" alt="" width={640} height={480} className="mx-auto mt-4 w-48 rounded-2xl object-cover capy-bob" rounded="2xl" />
        <h1 className="mt-6 font-display text-2xl font-semibold stagger-item" style={{ animationDelay: "80ms" }}>
          {chunk ? "Zenze updated" : "The tea spilled"}
        </h1>
        <p className="mt-3 max-w-md text-sm break-words text-muted-foreground stagger-item" style={{ animationDelay: "160ms" }}>
          {errorMessage(error)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 stagger-item" style={{ animationDelay: "240ms" }}>
          <HomeButton />
          <button
            type="button"
            onClick={() => (chunk ? window.location.reload() : reset())}
            className="inline-flex h-11 items-center rounded-md border border-border bg-card px-4 text-sm font-medium"
          >
            {chunk ? "Reload" : "Try again"}
          </button>
        </div>
      </div>
    </main>
  );
}
