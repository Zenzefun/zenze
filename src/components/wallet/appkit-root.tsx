import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { onAppKitLoadRequest } from "@/lib/appkit-bridge";
import { aliasOkxEthereum } from "@/lib/wallet";

const AppKitHost = lazy(() => import("./appkit-host").then((m) => ({ default: m.AppKitHost })));

class AppKitBoundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    return this.state.broken ? null : this.props.children;
  }
}

/** A returning wallet (Reown or WalletConnect session in storage) reconnects on load, as before. */
function hadWalletSession(): boolean {
  try {
    if (localStorage.getItem("zenze.wallet.rdns")) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      if (key.startsWith("@appkit/") || key.startsWith("wc@2:")) return true;
    }
  } catch {
    // storage blocked
  }
  return false;
}

/**
 * Keeps Reown AppKit out of the SSR graph and out of first paint. It loads on wallet intent
 * (see requestAppKitLoad) or right away for a returning wallet. AppKitProvider only creates the
 * singleton and renders no context, so it mounts as a sibling and the page never remounts.
 */
export function AppKitRoot({ children }: { children: ReactNode }) {
  const [load, setLoad] = useState(false);
  useEffect(() => {
    aliasOkxEthereum();
    if (hadWalletSession()) {
      setLoad(true);
      return;
    }
    return onAppKitLoadRequest(() => setLoad(true));
  }, []);
  return (
    <>
      {children}
      {load ? (
        <AppKitBoundary>
          <Suspense fallback={null}>
            <AppKitHost>{null}</AppKitHost>
          </Suspense>
        </AppKitBoundary>
      ) : null}
    </>
  );
}
