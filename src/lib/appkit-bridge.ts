/** Tiny registry so wallet.ts can talk to Reown without importing the SDK. */

type KitView = "Connect" | "Account" | "AllWallets" | "OnRampProviders";
type OpenFn = (view?: KitView) => void;
type DisconnectFn = () => Promise<void>;
type ConnectWalletFn = (walletId: string) => Promise<void>;

let openFn: OpenFn | null = null;
let disconnectFn: DisconnectFn | null = null;
let connectWalletFn: ConnectWalletFn | null = null;
const closeListeners = new Set<() => void>();
const readyListeners = new Set<() => void>();

export function registerAppKit(handlers: {
  open: OpenFn;
  disconnect: DisconnectFn;
  connectWallet?: ConnectWalletFn;
}) {
  openFn = handlers.open;
  disconnectFn = handlers.disconnect;
  connectWalletFn = handlers.connectWallet ?? null;
  for (const fn of [...readyListeners]) fn();
}

export function unregisterAppKit() {
  openFn = null;
  disconnectFn = null;
  connectWalletFn = null;
}

export function isAppKitRegistered(): boolean {
  return Boolean(openFn);
}

export function waitForAppKit(ms = 8_000): Promise<boolean> {
  if (openFn) return Promise.resolve(true);
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      readyListeners.delete(onReady);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onReady = () => finish(true);
    readyListeners.add(onReady);
    const timer = window.setTimeout(() => finish(Boolean(openFn)), ms);
  });
}

/** Open the Reown wallet list inside this page — never walletconnect.com. */
export function openAppKitModal(view: KitView = "Connect"): boolean {
  if (!openFn) return false;
  openFn(view);
  return true;
}

export async function openAppKitModalWhenReady(view: KitView = "Connect"): Promise<boolean> {
  const ready = await waitForAppKit();
  if (!ready || !openFn) return false;
  openFn(view);
  return true;
}

/** Connect a named wallet (okx, metamask, walletConnect, …) through AppKit. */
export async function connectAppKitWallet(walletId: string): Promise<boolean> {
  const ready = await waitForAppKit();
  if (!ready || !connectWalletFn) return false;
  await connectWalletFn(walletId);
  return true;
}

export async function disconnectAppKit(): Promise<void> {
  const fn = disconnectFn;
  if (fn) await fn();
}

export function onAppKitClosed(fn: () => void): () => void {
  closeListeners.add(fn);
  return () => {
    closeListeners.delete(fn);
  };
}

export function notifyAppKitClosed() {
  for (const fn of [...closeListeners]) fn();
}
