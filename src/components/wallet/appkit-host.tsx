import {
  AppKitProvider,
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useAppKitState,
  useAppKitTheme,
  useDisconnect,
  useWalletInfo,
} from "@reown/appkit/react";
import { useAppKitWallet, type Wallet } from "@reown/appkit-wallet-button/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { notifyAppKitClosed, registerAppKit, unregisterAppKit } from "@/lib/appkit-bridge";
import { appkitNetworks, robinhoodNetwork } from "@/lib/appkit-networks";
import { APPKIT_CUSTOM_WALLETS, FEATURED_WALLET_IDS } from "@/lib/appkit-wallets";
import { SITE } from "@/lib/seo";
import { publicConfig } from "@/lib/server/market";
import { aliasOkxEthereum, installEip6963Dedup, useWallet, type EthereumProvider } from "@/lib/wallet";

/** Public Reown Cloud id for zenze.fun (WalletConnect QR + injected). Override via desk Settings. */
const FALLBACK_REOWN_PROJECT_ID = "8f823148703a792a58936dc533095e64";


const METADATA = {
  name: SITE.name,
  description: SITE.description,
  url: SITE.url,
  icons: [`${SITE.url}/brand/capy-mark-64.png?v=20260924b`],
};

const ethersAdapter = new EthersAdapter();

function originMetadata() {
  if (typeof window === "undefined") return METADATA;
  return { ...METADATA, url: window.location.origin || SITE.url };
}

function isProjectId(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{32}$/i.test(value.trim()));
}

function AppKitSync() {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();
  const { connect } = useAppKitWallet({ namespace: "eip155" });
  const account = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider<EthereumProvider>("eip155");
  const network = useAppKitNetwork();
  const { walletInfo } = useWalletInfo("eip155");
  const kitState = useAppKitState();
  const { theme } = useTheme();
  const { setThemeMode } = useAppKitTheme();
  const attach = useWallet((s) => s.attachAppKit);
  const detach = useWallet((s) => s.detachAppKit);
  const connected = Boolean(account.isConnected && account.address && walletProvider);
  const wasOpen = useRef(false);

  useEffect(() => {
    setThemeMode(theme === "dark" ? "dark" : "light");
  }, [theme, setThemeMode]);

  useEffect(() => {
    registerAppKit({
      open: (view = "Connect") => {
        void open({ view, namespace: "eip155" });
      },
      disconnect: () => disconnect(),
      connectWallet: async (walletId: string) => {
        await connect(walletId as Wallet);
      },
    });
    return () => unregisterAppKit();
  }, [open, disconnect, connect]);

  useEffect(() => {
    if (kitState.open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      notifyAppKitClosed();
    }
  }, [kitState.open]);

  useEffect(() => {
    if (!connected || !account.address || !walletProvider) {
      detach();
      return;
    }
    const chainId = typeof network.chainId === "number" ? network.chainId : Number(network.chainId);
    void attach({
      provider: walletProvider,
      address: account.address,
      name: walletInfo?.name || "Wallet",
      chainId: Number.isFinite(chainId) ? chainId : null,
    });
  }, [attach, detach, connected, account.address, walletProvider, network.chainId, walletInfo?.name]);

  return null;
}

function AppKitTree({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { theme } = useTheme();
  const metadata = useMemo(() => originMetadata(), []);

  return (
    <AppKitProvider
      projectId={projectId}
      adapters={[ethersAdapter]}
      networks={appkitNetworks}
      defaultNetwork={robinhoodNetwork}
      metadata={metadata}
      themeMode={theme === "dark" ? "dark" : "light"}
      themeVariables={{
        "--apkt-accent": "#d4a545",
        "--apkt-font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
        "--apkt-border-radius-master": "12px",
        "--apkt-z-index": 12000,
      }}
      features={{
        analytics: true,
        swaps: false,
        onramp: ["meld"],
        email: false,
        socials: false,
        history: false,
        receive: false,
        send: false,
        connectMethodsOrder: ["wallet"],
      }}
      featuredWalletIds={[...FEATURED_WALLET_IDS]}
      customWallets={APPKIT_CUSTOM_WALLETS}
      allWallets="SHOW"
      showWallets
      enableEIP6963
      enableInjected={false}
      enableCoinbase
      enableWallets
      enableReconnect
      allowUnsupportedChain={true}
      defaultAccountTypes={{ eip155: "eoa" }}
      chainImages={{
        4663: "/chains/robinhood.svg",
        5042: "/chains/arc.svg",
      }}
      termsConditionsUrl={`${SITE.url}/legal`}
      debug={false}
    >
      <AppKitSync />
      {children}
    </AppKitProvider>
  );
}

installEip6963Dedup();

/** Client-only Reown AppKit. Project ID is public (dashboard.reown.com). Without it, injected + deeplinks still work. */
export function AppKitHost({ children }: { children: ReactNode }) {
  installEip6963Dedup();
  const cfg = useQuery({ queryKey: ["public-config"], queryFn: () => publicConfig() });
  useEffect(() => {
    aliasOkxEthereum();
  }, []);

  const fromDesk = isProjectId(cfg.data?.reown_project_id) ? cfg.data!.reown_project_id.trim() : "";
  const fromEnv =
    typeof import.meta !== "undefined" && isProjectId(import.meta.env?.VITE_REOWN_PROJECT_ID)
      ? String(import.meta.env.VITE_REOWN_PROJECT_ID).trim()
      : "";
  const projectId = fromDesk || fromEnv || FALLBACK_REOWN_PROJECT_ID;

  return <AppKitTree projectId={projectId}>{children}</AppKitTree>;
}
