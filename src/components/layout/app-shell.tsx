import { useEffect, type ReactNode } from "react";
import { Footer } from "./footer";
import { Header } from "./header";
import { installWalletErrorGuard, useWallet } from "@/lib/wallet";
import { captureRef, storedRef } from "@/lib/referral";
import { recordReferral } from "@/lib/server/referral";

export function AppShell({ children, znzfPrice }: { children: ReactNode; znzfPrice?: number | null }) {
  const init = useWallet((s) => s.init);
  const address = useWallet((s) => s.address);
  useEffect(() => {
    installWalletErrorGuard();
    captureRef();
    void init();
  }, [init]);
  useEffect(() => {
    const code = storedRef();
    if (!address || !code) return;
    void recordReferral({ data: { code, kind: "visit", wallet: address } });
  }, [address]);

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden steam-veil">
      <Header znzfPrice={znzfPrice} />
      <main className="min-w-0 flex-1">{children}</main>
      <Footer />
    </div>
  );
}
