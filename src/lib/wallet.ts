import { create } from "zustand";
import { encodeFunctionData, getAddress, parseAbi, toHex } from "viem";
import { disconnectAppKit, isAppKitRegistered, onAppKitClosed, openAppKitModalWhenReady } from "./appkit-bridge";
import { CHAINS, chainById, type ChainInfo, type ChainKey } from "./chains";
import { walletIntentMessage, type WalletAction } from "./intent";
import { clearSession, readSession, sessionMessage, writeSession } from "./session";
import { matchCatalog, WALLET_CATALOG } from "./featured-wallets";
import { iabWalletId, inWalletInAppBrowser } from "./wallet-deeplink";

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isGrok?: boolean;
  isDummy?: boolean;
  __dummy?: boolean;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isOKX?: boolean;
  isTrust?: boolean;
  isCoinbaseWallet?: boolean;
};

export type DiscoveredWallet = {
  uuid: string;
  name: string;
  rdns: string;
  icon: string;
  provider: EthereumProvider;
};

type Eip6963Announce = CustomEvent<{
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EthereumProvider;
}>;

const RDNS_KEY = "zenze.wallet.rdns";
const CHAIN_KEY = "zenze.chain";
const DUMMY_RE = /dummy|mock|fake|stub|test[\s-]?wallet|grok[\s-]?wallet|phantom dummy|playground|internal json-rpc/i;
const REAL_INJECTED_FLAGS = [
  "isMetaMask",
  "isCoinbaseWallet",
  "isRabby",
  "isRainbow",
  "isTrust",
  "isOkxWallet",
  "isOKExWallet",
  "isOKX",
  "isBraveWallet",
  "isPhantom",
  "isBitKeep",
  "isTokenPocket",
  "isFrame",
  "isOpera",
  "isAvalanche",
  "isKuCoinWallet",
  "isOneInchIOSWallet",
  "isOneInchAndroidWallet",
  "isZerion",
  "isBackpack",
  "isBinance",
  "isBybit",
] as const;

function asAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(v) ? v : null;
}

function hexToNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number.parseInt(value, 16);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function hexToNative(value: unknown, decimals: number): number {
  if (typeof value !== "string") return 0;
  try {
    return Number(BigInt(value)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

function providerSource(provider: EthereumProvider | null | undefined): string {
  if (!provider) return "";
  try {
    const fn = provider.request;
    return typeof fn === "function" ? Function.prototype.toString.call(fn) : "";
  } catch {
    return "";
  }
}

export function isDummyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return DUMMY_RE.test(msg);
}

export function publicWalletError(err: unknown): string {
  if (isDummyError(err)) {
    return "That wallet isn't available here. Connect with MetaMask, Rabby, or Coinbase Wallet.";
  }
  const raw = flattenWalletError(err);
  if (/insufficient funds|insufficient gas|gas required exceeds|max fee per gas less|replacement transaction underpriced/i.test(raw)) {
    return "Not enough native token for this transaction. Top up a little more ETH on Robinhood, or USDC on Arc, then retry.";
  }
  if (/user rejected|rejected the request|denied transaction|action_rejected/i.test(raw)) {
    return "Transaction was rejected in the wallet.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return "Wallet connection was rejected.";
}

function flattenWalletError(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  const e = err as Record<string, unknown>;
  const parts = [
    e.message,
    e.shortMessage,
    e.details,
    e.reason,
    typeof e.data === "object" && e.data ? (e.data as { message?: unknown }).message : e.data,
    typeof e.error === "object" && e.error ? (e.error as { message?: unknown }).message : e.error,
    e.cause instanceof Error ? e.cause.message : undefined,
  ];
  return parts.filter((p) => typeof p === "string" && p.trim()).join(" ");
}

export function isStubProvider(provider: EthereumProvider | null | undefined): boolean {
  if (!provider || typeof provider.request !== "function") return true;
  try {
    if (provider.isGrok || provider.isDummy || provider.__dummy) return true;
  } catch {
    return true;
  }
  const src = providerSource(provider);
  return DUMMY_RE.test(src);
}

function looksLikeRealInjected(provider: EthereumProvider): boolean {
  if (isStubProvider(provider)) return false;
  const rec = provider as unknown as Record<string, unknown>;
  return REAL_INJECTED_FLAGS.some((flag) => Boolean(rec[flag]));
}

export function isDummyWallet(
  wallet: { name?: string; rdns?: string; provider?: EthereumProvider } | null | undefined,
): boolean {
  if (!wallet) return true;
  const rdns = (wallet.rdns ?? "").trim().toLowerCase();
  if (rdns === "reown.appkit" || rdns === "walletconnect") return false;
  if (isStubProvider(wallet.provider)) return true;
  const name = (wallet.name ?? "").trim();
  if (DUMMY_RE.test(`${name} ${rdns}`)) return true;
  if (rdns === "dummy") return true;
  if (!rdns) {
    if (wallet.provider && looksLikeRealInjected(wallet.provider)) return false;
    return true;
  }
  return false;
}

function inPreviewFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function readStoredRdns(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(RDNS_KEY)?.trim().toLowerCase();
    if (!v || v === "injected" || v === "dummy" || DUMMY_RE.test(v)) return null;
    return v;
  } catch {
    return null;
  }
}

function writeStoredRdns(rdns: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (rdns && !isDummyWallet({ rdns, name: "", provider: undefined })) {
      localStorage.setItem(RDNS_KEY, rdns.toLowerCase());
    } else {
      localStorage.removeItem(RDNS_KEY);
    }
  } catch {
    // private mode
  }
}

function readStoredChain(): ChainKey {
  if (typeof window === "undefined") return "robinhood";
  try {
    const v = localStorage.getItem(CHAIN_KEY);
    if (v === "arc" || v === "robinhood") return v;
  } catch {
    // private mode
  }
  return "robinhood";
}

function writeStoredChain(key: ChainKey) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHAIN_KEY, key);
  } catch {
    // private mode
  }
}

export type SignedIntent = {
  wallet: string;
  signature: string;
  timestamp: number;
};

export type WalletTx = {
  to?: string;
  data: string;
  value?: bigint;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
};

type WalletState = {
  hasProvider: boolean;
  connected: boolean;
  address: string | null;
  chainId: number | null;
  native: number;
  connecting: boolean;
  error: string | null;
  walletName: string | null;
  wallets: DiscoveredWallet[];
  preferredChain: ChainKey;
  ready: boolean;
  connectModalOpen: boolean;
  source: "injected" | "appkit" | null;
  signed: boolean;
  signing: boolean;
  init: () => Promise<void>;
  discover: () => void;
  openConnectModal: () => void;
  closeConnectModal: () => void;
  connect: () => Promise<string>;
  connectWith: (wallet: DiscoveredWallet) => Promise<string>;
  attachAppKit: (input: {
    provider: EthereumProvider;
    address: string;
    name: string;
    chainId: number | null;
  }) => Promise<void>;
  detachAppKit: () => void;
  disconnect: () => void;
  refresh: () => Promise<void>;
  setPreferredChain: (key: ChainKey) => void;
  switchChain: (key: ChainKey) => Promise<void>;
  sign: (message: string) => Promise<string>;
  signIntent: (input: { action: WalletAction; tokenId?: string; amount?: string }) => Promise<SignedIntent>;
  ensureSession: () => Promise<boolean>;
  readErc20Balance: (token: string, decimals?: number) => Promise<number>;
  sendTransaction: (tx: WalletTx) => Promise<string>;
  waitReceipt: (hash: string) => Promise<{
    status: "success" | "reverted";
    contractAddress: string | null;
    from: string;
    to: string | null;
    logs: { address: string; topics: string[]; data: string }[];
    hash: string;
  }>;
  watchAsset: (input: {
    address: string;
    symbol: string;
    decimals: number;
    image?: string;
    chain?: ChainKey;
    name?: string;
  }) => Promise<boolean>;
};

let skipSessionOnce = false;

/** Desk sign-in only needs the admin intent — skip the extra session popup. */
export function beginDeskConnect() {
  skipSessionOnce = true;
}

let bound: EthereumProvider | null = null;
let selected: EthereumProvider | null = null;
let discovered = new Map<string, DiscoveredWallet>();
let sawEip6963Announce = false;
let discoveryBound = false;
let storeInited = false;
let initPromise: Promise<void> | null = null;
let guardsInstalled = false;

/** Swallow stub-wallet exceptions so first paint is never an error overlay. */
export function installWalletErrorGuard() {
  if (typeof window === "undefined" || guardsInstalled) return;
  guardsInstalled = true;
  const swallow = (ev: Event) => {
    const anyEv = ev as PromiseRejectionEvent & ErrorEvent;
    const reason =
      "reason" in anyEv && anyEv.reason != null
        ? anyEv.reason
        : "error" in anyEv && anyEv.error != null
          ? anyEv.error
          : "message" in anyEv
            ? anyEv.message
            : "";
    if (isDummyError(reason)) {
      anyEv.preventDefault?.();
      anyEv.stopImmediatePropagation?.();
    }
  };
  window.addEventListener("unhandledrejection", swallow);
  window.addEventListener("error", swallow);
}

if (typeof window !== "undefined") installWalletErrorGuard();

function injectedEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return provider && typeof provider.request === "function" ? provider : undefined;
}

/** Last-resort injected provider. Never used for auto-connect. Never used if a stub announced. */
export function injectedFallback(): DiscoveredWallet | null {
  const iab = inAppBrowserWallet();
  if (iab) return iab;
  const provider = injectedEthereum();
  if (!provider) return null;
  if (discovered.size > 0 || sawEip6963Announce) return null;
  if (isStubProvider(provider)) return null;
  if (!looksLikeRealInjected(provider)) return null;
  const wallet: DiscoveredWallet = {
    uuid: "injected",
    name: "Browser wallet",
    rdns: "browser.injected",
    icon: "/wallets/metamask.svg",
    provider,
  };
  if (isDummyWallet(wallet)) return null;
  return wallet;
}

function getProvider(): EthereumProvider | undefined {
  if (selected) return selected;
  return undefined;
}

function bind(provider: EthereumProvider, refresh: () => Promise<void>, disconnect: () => void) {
  if (isStubProvider(provider)) return;
  if (bound === provider) return;
  if (bound?.removeListener) {
    bound.removeListener("accountsChanged", onAccounts as (...args: unknown[]) => void);
    bound.removeListener("chainChanged", onChain as (...args: unknown[]) => void);
  }
  bound = provider;
  function onAccounts(accounts: unknown) {
    try {
      const list = Array.isArray(accounts) ? accounts : [];
      if (!list[0]) disconnect();
      else void refresh().catch(() => undefined);
    } catch {
      // stub wallets fire junk events
    }
  }
  function onChain() {
    void refresh().catch(() => undefined);
  }
  try {
    provider.on?.("accountsChanged", onAccounts as (...args: unknown[]) => void);
    provider.on?.("chainChanged", onChain as (...args: unknown[]) => void);
  } catch {
    // ignore stub wallets that throw on subscribe
  }
}

function walletIdentity(rdns: string, name: string): string {
  const catalog = matchCatalog(rdns);
  if (catalog) return catalog.id;
  return name.trim().toLowerCase().replace(/\s+wallet$/i, "").replace(/[^a-z0-9]+/g, "") || rdns || name;
}

function snapshotWallets(): DiscoveredWallet[] {
  const best = new Map<string, DiscoveredWallet>();
  for (const wallet of discovered.values()) {
    if (isDummyWallet(wallet)) continue;
    const key = walletIdentity(wallet.rdns, wallet.name);
    const current = best.get(key);
    const injected = wallet.uuid.startsWith("injected:");
    if (!current || (current.uuid.startsWith("injected:") && !injected)) best.set(key, wallet);
  }
  return [...best.values()];
}

let eip6963Deduped = false;

function canonicalAnnounceRdns(rdns: string, name: string): string {
  const raw = rdns.trim().toLowerCase();
  const byRdns = matchCatalog(raw);
  if (byRdns) return byRdns.rdns[0];
  const folded = name.trim().toLowerCase().replace(/\s+wallet$/i, "").replace(/[^a-z0-9]+/g, "");
  const byName = WALLET_CATALOG.find((w) => {
    const id = w.id.replace(/[^a-z0-9]+/g, "");
    const label = w.name.toLowerCase().replace(/\s+wallet$/i, "").replace(/[^a-z0-9]+/g, "");
    return folded.length > 2 && (folded === id || folded === label);
  });
  if (byName) return byName.rdns[0];
  if (/bitget|bitkeep/.test(folded) || /bitget|bitkeep/.test(raw)) return "com.bitget.web3";
  if (/okx|okex/.test(folded) || /okx|okex/.test(raw)) return "com.okex.wallet";
  return raw;
}

/** One wallet, one rdns. Bitget announces com.bitget.web3 and com.bitget.wallet; AppKit shows both unless they match. */
export function installEip6963Dedup() {
  if (typeof window === "undefined" || eip6963Deduped) return;
  eip6963Deduped = true;
  const seen = new Set<string>();
  window.addEventListener(
    "eip6963:announceProvider",
    (event) => {
      const announced = event as Eip6963Announce & { __zenzeRewrite?: boolean };
      const detail = announced.detail;
      if (!detail?.info || !detail.provider) return;
      const canonical = canonicalAnnounceRdns(detail.info.rdns || "", detail.info.name || "");
      const key = walletIdentity(canonical, detail.info.name || "");
      if (!key) return;
      if (announced.__zenzeRewrite) {
        if (seen.has(key)) announced.stopImmediatePropagation();
        else seen.add(key);
        return;
      }
      if (seen.has(key)) {
        announced.stopImmediatePropagation();
        return;
      }
      const raw = (detail.info.rdns || "").trim().toLowerCase();
      if (canonical && canonical !== raw) {
        announced.stopImmediatePropagation();
        const rewritten = new CustomEvent("eip6963:announceProvider", {
          detail: { info: { ...detail.info, rdns: canonical }, provider: detail.provider },
        }) as CustomEvent & { __zenzeRewrite?: boolean };
        rewritten.__zenzeRewrite = true;
        window.dispatchEvent(rewritten);
        return;
      }
      seen.add(key);
    },
    true,
  );
}

function harvestWindowInjected() {
  if (typeof window === "undefined") return;
  aliasOkxEthereum();
  const w = window as unknown as {
    ethereum?: EthereumProvider & {
      providers?: EthereumProvider[];
      detected?: EthereumProvider[];
    } & Record<string, unknown>;
    okxwallet?: EthereumProvider;
    okexchain?: EthereumProvider;
    bitkeep?: { ethereum?: EthereumProvider };
    tokenpocket?: EthereumProvider;
    trustwallet?: EthereumProvider;
    phantom?: { ethereum?: EthereumProvider };
    coinbaseWalletExtension?: EthereumProvider;
    binancew3w?: EthereumProvider;
  };
  const add = (name: string, rdns: string, icon: string, provider: EthereumProvider | undefined) => {
    if (!provider || typeof provider.request !== "function") return;
    if (isStubProvider(provider)) return;
    if ([...discovered.values()].some((d) => d.rdns === rdns || d.provider === provider)) return;
    const wallet: DiscoveredWallet = { uuid: `injected:${rdns}`, name, rdns, icon, provider };
    if (isDummyWallet(wallet)) return;
    discovered.set(wallet.uuid, wallet);
  };
  const eth = w.ethereum;
  const rec = eth as unknown as Record<string, unknown> | undefined;
  const okx =
    w.okxwallet ||
    w.okexchain ||
    (eth && (eth.isOkxWallet || eth.isOKExWallet || rec?.isOKX || rec?.isOkxWallet) ? eth : undefined);
  add("OKX Wallet", "com.okex.wallet", "/wallets/okx.svg", okx);
  add("Bitget Wallet", "com.bitget.web3", "/wallets/bitget.svg", w.bitkeep?.ethereum);
  add("TokenPocket", "pro.tokenpocket", "/wallets/tokenpocket.svg", w.tokenpocket);
  add("Trust Wallet", "com.trustwallet.app", "/wallets/trust.svg", w.trustwallet || (eth && eth.isTrust ? eth : undefined));
  add("Phantom", "app.phantom", "/wallets/phantom.svg", w.phantom?.ethereum);
  add("Coinbase Wallet", "com.coinbase.wallet", "/wallets/coinbase.svg", w.coinbaseWalletExtension);
  add("Binance Wallet", "com.binance.wallet", "/wallets/binance.svg", w.binancew3w);
  if (inWalletInAppBrowser() && iabWalletId() === "okx") {
    add("OKX Wallet", "com.okex.wallet", "/wallets/okx.svg", okx || eth);
  }
  const extras = [...(eth?.providers ?? []), ...(eth?.detected ?? [])];
  for (const p of extras) {
    if (!p || typeof p.request !== "function") continue;
    const flags = p as EthereumProvider & Record<string, unknown>;
    if (flags.isOkxWallet || flags.isOKExWallet || flags.isOKX) {
      add("OKX Wallet", "com.okex.wallet", "/wallets/okx.svg", p);
    } else if (flags.isTrust) {
      add("Trust Wallet", "com.trustwallet.app", "/wallets/trust.svg", p);
    } else if (flags.isCoinbaseWallet) {
      add("Coinbase Wallet", "com.coinbase.wallet", "/wallets/coinbase.svg", p);
    } else if (flags.isMetaMask) {
      add("MetaMask", "io.metamask", "/wallets/metamask.svg", p);
    }
  }
}

/** Wallet already wrapping this page (OKX / MetaMask / Trust in-app browser). */
export function inAppBrowserWallet(): DiscoveredWallet | null {
  if (typeof window === "undefined") return null;
  if (!inWalletInAppBrowser()) return null;
  harvestWindowInjected();
  const id = iabWalletId();
  const snap = snapshotWallets();
  if (id === "okx") {
    const hit = snap.find((w) => w.rdns === "com.okex.wallet" || /okx/i.test(w.name));
    if (hit) return hit;
  }
  if (snap[0]) return snap[0];
  const provider = injectedEthereum();
  if (!provider || isStubProvider(provider)) return null;
  const catalog =
    id === "okx"
      ? { name: "OKX Wallet", rdns: "com.okex.wallet", icon: "/wallets/okx.svg" }
      : id === "metamask"
        ? { name: "MetaMask", rdns: "io.metamask", icon: "/wallets/metamask.svg" }
        : id === "trust"
          ? { name: "Trust Wallet", rdns: "com.trustwallet.app", icon: "/wallets/trust.svg" }
          : { name: "Browser wallet", rdns: "browser.injected", icon: "/wallets/metamask.svg" };
  const wallet: DiscoveredWallet = { uuid: `iab:${catalog.rdns}`, ...catalog, provider };
  return isDummyWallet(wallet) ? null : wallet;
}

/** Make OKX visible to EIP-6963 / AppKit injected detection (window.okxwallet is often not on window.ethereum). */
export function aliasOkxEthereum() {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    ethereum?: EthereumProvider & { providers?: EthereumProvider[] };
    okxwallet?: EthereumProvider;
    okexchain?: EthereumProvider;
  };
  const okx = w.okxwallet || w.okexchain;
  if (!okx || typeof okx.request !== "function") return;
  if (!w.ethereum) {
    w.ethereum = okx;
    return;
  }
  if (w.ethereum === okx) return;
  const providers = w.ethereum.providers;
  if (Array.isArray(providers) && !providers.includes(okx)) {
    providers.unshift(okx);
  }
}

export function discoverWallets(): DiscoveredWallet[] {
  if (typeof window === "undefined") return [];
  harvestWindowInjected();
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // ignore
  }
  harvestWindowInjected();
  const iab = inAppBrowserWallet();
  if (iab && !discovered.has(iab.uuid) && ![...discovered.values()].some((d) => d.provider === iab.provider)) {
    discovered.set(iab.uuid, iab);
  }
  return snapshotWallets();
}

export function subscribeWallets(onChange: (wallets: DiscoveredWallet[]) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onAnnounce = (event: Event) => {
    try {
      const detail = (event as Eip6963Announce).detail;
      if (!detail?.info?.uuid || !detail.provider) return;
      sawEip6963Announce = true;
      const wallet: DiscoveredWallet = {
        uuid: detail.info.uuid,
        name: detail.info.name || "Wallet",
        rdns: (detail.info.rdns || "").trim(),
        icon: detail.info.icon || "",
        provider: detail.provider,
      };
      if (isDummyWallet(wallet)) {
        onChange(snapshotWallets());
        return;
      }
      discovered.set(detail.info.uuid, wallet);
      onChange(snapshotWallets());
    } catch {
      // dummy announce
    }
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  if (!discoveryBound) {
    discoveryBound = true;
  }
  harvestWindowInjected();
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    // ignore
  }
  harvestWindowInjected();
  const timer = window.setTimeout(() => {
    harvestWindowInjected();
    onChange(snapshotWallets());
  }, 250);
  onChange(snapshotWallets());
  return () => {
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
    window.clearTimeout(timer);
  };
}

async function silentAccounts(provider: EthereumProvider): Promise<string | null> {
  if (isStubProvider(provider)) return null;
  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    return asAddress(accounts?.[0]);
  } catch (err) {
    if (isDummyError(err)) return null;
    return null;
  }
}

export const useWallet = create<WalletState>((set, get) => ({
  hasProvider: false,
  connected: false,
  address: null,
  chainId: null,
  native: 0,
  connecting: false,
  error: null,
  walletName: null,
  wallets: [],
  preferredChain: "robinhood",
  ready: false,
  connectModalOpen: false,
  source: null,
  signed: false,
  signing: false,

  init: async () => {
    if (typeof window === "undefined") return;
    installWalletErrorGuard();
    aliasOkxEthereum();
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!storeInited) {
        storeInited = true;
        subscribeWallets((wallets) => {
          set({ wallets, hasProvider: wallets.length > 0 });
        });
      }
      set({
        preferredChain: readStoredChain(),
        hasProvider: snapshotWallets().length > 0,
        ready: true,
        error: null,
      });
      await new Promise((r) => window.setTimeout(r, 200));
      const wallets = snapshotWallets();
      set({ wallets, hasProvider: wallets.length > 0 });
      // Preview iframes inject a stub provider. Never auto-connect there.
      if (inPreviewFrame()) return;
      // A saved browser wallet is not a second login. Reown reconnects its own session.
      return;
    })()
      .catch(() => {
        selected = null;
        set({ connected: false, address: null, walletName: null, error: null, ready: true });
      })
      .finally(() => {
        if (!get().ready) set({ ready: true });
      });
    return initPromise;
  },

  discover: () => {
    set({ wallets: discoverWallets(), hasProvider: snapshotWallets().length > 0 });
  },

  openConnectModal: () => {
    void openAppKitModalWhenReady("Connect");
  },
  closeConnectModal: () => set({ connectModalOpen: false }),

  setPreferredChain: (key) => {
    writeStoredChain(key);
    set({ preferredChain: key });
  },

  connect: async () => {
    const existing = get().address;
    if (get().connected && existing) return existing;
    const opened = await openAppKitModalWhenReady("Connect");
    if (!opened) throw new Error("Wallet is still loading. Try again.");
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        unsub();
        offClose();
        fn();
      };
      const unsub = useWallet.subscribe((s) => {
        if (s.connected && s.address) finish(() => resolve(s.address!));
      });
      const offClose = onAppKitClosed(() => {
        window.setTimeout(() => {
          if (get().connected && get().address) return;
          finish(() => reject(new Error("Connect a wallet first.")));
        }, 400);
      });
    });
  },

  connectWith: async () => get().connect(),

  attachAppKit: async ({ provider, address, name, chainId }) => {
    if (!provider || typeof provider.request !== "function") return;
    const addr = asAddress(address);
    if (!addr) return;
    selected = provider;
    bind(provider, get().refresh, get().disconnect);
    writeStoredRdns("reown.appkit");
    set({
      connected: true,
      address: addr,
      walletName: name || "Wallet",
      chainId,
      hasProvider: true,
      connecting: false,
      connectModalOpen: false,
      error: null,
      source: "appkit",
      signed: Boolean(readSession(addr)),
    });
    try {
      await get().refresh();
      if (skipSessionOnce) skipSessionOnce = false;
      else await get().ensureSession();
    } catch {
      // AppKit still holds the session
    }
  },

  detachAppKit: () => {
    if (get().source !== "appkit") return;
    selected = null;
    writeStoredRdns(null);
    clearSession(get().address);
    set({ connected: false, address: null, native: 0, error: null, walletName: null, chainId: null, source: null, signed: false });
  },

  disconnect: () => {
    const wasAppkit = get().source === "appkit";
    clearSession(get().address);
    selected = null;
    writeStoredRdns(null);
    set({ connected: false, address: null, native: 0, error: null, walletName: null, chainId: null, source: null, signed: false });
    if (wasAppkit) void disconnectAppKit();
  },

  refresh: async () => {
    const provider = getProvider();
    const address = get().address;
    if (!provider || !address) return;
    if (isStubProvider(provider)) {
      selected = null;
      writeStoredRdns(null);
      set({ connected: false, address: null, walletName: null, error: null });
      return;
    }
    try {
      const [chainHex, balHex] = await Promise.all([
        provider.request({ method: "eth_chainId" }),
        provider.request({ method: "eth_getBalance", params: [address, "latest"] }),
      ]);
      const chainId = hexToNumber(chainHex);
      const decimals = chainById(chainId)?.decimals ?? 18;
      const known = chainById(chainId);
      if (known) {
        writeStoredChain(known.key);
        set({ preferredChain: known.key, chainId, native: hexToNative(balHex, decimals), hasProvider: true });
      } else {
        set({ chainId, native: hexToNative(balHex, decimals), hasProvider: true });
      }
    } catch (err) {
      if (isDummyError(err)) {
        selected = null;
        writeStoredRdns(null);
        set({ connected: false, address: null, walletName: null, error: null });
      }
    }
  },

  switchChain: async (key) => {
    writeStoredChain(key);
    set({ preferredChain: key });
    const provider = getProvider();
    if (!provider) return;
    if (isStubProvider(provider)) throw new Error(publicWalletError(new Error("dummy")));
    const chain = CHAINS[key];
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.hexId }] });
    } catch (err) {
      if (isDummyError(err)) throw new Error(publicWalletError(err));
      const code = (err as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chain.hexId,
              chainName: chain.name,
              nativeCurrency: { name: chain.gasName, symbol: chain.gas, decimals: chain.decimals },
              rpcUrls: [chain.rpc],
              blockExplorerUrls: [chain.explorer],
            },
          ],
        });
      } else {
        throw err instanceof Error ? err : new Error("Could not switch networks.");
      }
    }
    await get().refresh();
  },

  sign: async (message) => {
    const provider = getProvider();
    const address = get().address;
    if (!provider || !address) throw new Error("Connect a wallet first.");
    if (isStubProvider(provider)) throw new Error(publicWalletError(new Error("dummy")));
    try {
      const signature = await provider.request({
        method: "personal_sign",
        params: [toHex(message), address],
      });
      if (typeof signature !== "string") throw new Error("Wallet did not return a signature.");
      return signature;
    } catch (err) {
      throw new Error(publicWalletError(err));
    }
  },

  signIntent: async ({ action, tokenId, amount }) => {
    const address = get().address;
    if (!address) throw new Error("Connect a wallet first.");
    const timestamp = Date.now();
    const message = walletIntentMessage({ action, wallet: address, timestamp, tokenId, amount });
    const signature = await get().sign(message);
    return { wallet: address, signature, timestamp };
  },

  ensureSession: async () => {
    const address = get().address;
    if (!address) throw new Error("Connect a wallet first.");
    const existing = readSession(address);
    if (existing) {
      set({ signed: true });
      return true;
    }
    set({ signing: true, error: null });
    try {
      const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timestamp = Date.now();
      const message = sessionMessage({ wallet: address, nonce, timestamp, chainId: get().chainId });
      const signature = await get().sign(message);
      writeSession({ wallet: address, signature, timestamp, nonce, chainId: get().chainId });
      set({ signed: true, signing: false });
      return true;
    } catch (err) {
      set({ signing: false, signed: false, error: publicWalletError(err) });
      throw err instanceof Error ? err : new Error(publicWalletError(err));
    }
  },

  readErc20Balance: async (token, decimals = 18) => {
    const provider = getProvider();
    const address = get().address;
    if (!provider || !address) return 0;
    if (!/^0x[a-fA-F0-9]{40}$/.test(token)) return 0;
    try {
      const data = encodeFunctionData({
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
      const result = await provider.request({
        method: "eth_call",
        params: [{ to: token, data }, "latest"],
      });
      if (typeof result !== "string" || result === "0x") return 0;
      return Number(BigInt(result)) / 10 ** decimals;
    } catch {
      return 0;
    }
  },

  sendTransaction: async (tx) => {
    const provider = getProvider();
    const address = get().address;
    if (!provider || !address) throw new Error("Connect a wallet first.");
    if (isStubProvider(provider)) throw new Error(publicWalletError(new Error("dummy")));
    const params: Record<string, string> = {
      from: getAddress(address),
      data: tx.data,
    };
    if (tx.to) params.to = getAddress(tx.to);
    if (tx.value != null && tx.value > 0n) params.value = toHex(tx.value);
    if (tx.gas != null && tx.gas > 0n) params.gas = toHex(tx.gas);
    if (tx.maxFeePerGas != null && tx.maxFeePerGas > 0n) params.maxFeePerGas = toHex(tx.maxFeePerGas);
    if (tx.maxPriorityFeePerGas != null && tx.maxPriorityFeePerGas > 0n) {
      params.maxPriorityFeePerGas = toHex(tx.maxPriorityFeePerGas);
    } else if (tx.gasPrice != null && tx.gasPrice > 0n && !params.maxFeePerGas) {
      params.gasPrice = toHex(tx.gasPrice);
    }
    try {
      const hash = await provider.request({ method: "eth_sendTransaction", params: [params] });
      if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("Wallet did not return a transaction hash.");
      return hash;
    } catch (err) {
      throw new Error(publicWalletError(err));
    }
  },

  waitReceipt: async (hash) => {
    const provider = getProvider();
    if (!provider) throw new Error("Connect a wallet first.");
    const started = Date.now();
    while (Date.now() - started < 90_000) {
      try {
        const receipt = (await provider.request({
          method: "eth_getTransactionReceipt",
          params: [hash],
        })) as null | {
          status?: string | number;
          contractAddress?: string | null;
          from?: string;
          to?: string | null;
          logs?: { address: string; topics: string[]; data: string }[];
          transactionHash?: string;
        };
        if (receipt) {
          const raw = receipt.status;
          const reverted = raw === "0x0" || raw === "0" || raw === 0;
          const success = raw === "0x1" || raw === "1" || raw === 1 || (!reverted && (receipt.logs?.length ?? 0) > 0);
          if (raw == null && !(receipt.logs && receipt.logs.length)) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          return {
            status: success && !reverted ? "success" : "reverted",
            contractAddress: asAddress(receipt.contractAddress),
            from: asAddress(receipt.from) ?? "",
            to: asAddress(receipt.to),
            logs: receipt.logs ?? [],
            hash: receipt.transactionHash ?? hash,
          };
        }
      } catch {
        // RPC lag — keep polling
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Transaction is still pending. Check the explorer and refresh.");
  },

  watchAsset: async ({ address, symbol, decimals, image, chain, name }) => {
    const provider = getProvider();
    if (!provider) throw new Error("Connect a wallet first.");
    if (isStubProvider(provider)) throw new Error(publicWalletError(new Error("dummy")));
    if (chain && get().chainId !== CHAINS[chain].id) {
      await get().switchChain(chain);
    }
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const imageUrl = image
      ? image.startsWith("http") || image.startsWith("ipfs://")
        ? image.startsWith("ipfs://")
          ? `https://copper-cheerful-mite-422.mypinata.cloud/ipfs/${image.slice(7)}`
          : image
        : `${origin}${image.startsWith("/") ? image : `/${image}`}`
      : `${origin}/brand/capy-mark-64.png?v=20260924b`;
    const tokenName = (name ?? "").trim() || symbol;
    const options = { address, symbol, decimals, image: imageUrl, name: tokenName };
    try {
      const ok = await provider.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options },
      });
      return Boolean(ok);
    } catch (first) {
      try {
        const ok = await provider.request({
          method: "wallet_watchAsset",
          params: { type: "ERC20", options: { address, symbol, decimals, image: imageUrl } },
        });
        return Boolean(ok);
      } catch {
        throw new Error(publicWalletError(first));
      }
    }
  },
}));

export function networkLabel(chainId: number | null): string {
  const known = chainById(chainId);
  if (known) return known.name;
  if (chainId == null) return "Select a network";
  return "Unsupported network";
}

export function nativeSymbol(chainId: number | null): string {
  return chainById(chainId)?.gas ?? "ETH";
}

export function matchingChain(chainId: number | null): ChainInfo | null {
  return chainById(chainId);
}

export function txGas(prep: { gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string }) {
  return {
    gas: BigInt(prep.gas),
    maxFeePerGas: BigInt(prep.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(prep.maxPriorityFeePerGas),
  };
}
