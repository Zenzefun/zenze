import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { aliasOkxEthereum } from "@/lib/wallet";

const AppKitHost = lazy(() => import("./appkit-host").then((m) => ({ default: m.AppKitHost })));

class AppKitBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    return this.state.broken ? this.props.fallback : this.props.children;
  }
}

/** Keeps Reown AppKit out of the SSR graph. WalletConnect QR still loads on first paint. */
export function AppKitRoot({ children }: { children: ReactNode }) {
  const [client, setClient] = useState(false);
  useEffect(() => {
    aliasOkxEthereum();
    setClient(true);
  }, []);
  if (!client) return children;
  return (
    <AppKitBoundary fallback={children}>
      <Suspense fallback={children}>
        <AppKitHost>{children}</AppKitHost>
      </Suspense>
    </AppKitBoundary>
  );
}
