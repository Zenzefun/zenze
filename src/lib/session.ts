const KEY = "zenze.session";
const TTL_MS = 24 * 60 * 60 * 1000;

export type WalletSession = {
  wallet: string;
  signature: string;
  timestamp: number;
  nonce: string;
  chainId: number | null;
};

export function sessionMessage(input: {
  wallet: string;
  nonce: string;
  timestamp: number;
  chainId: number | null;
}): string {
  return [
    "Zenzen wants you to sign in.",
    "This proves you own the wallet. It does not send a transaction or spend gas.",
    `Wallet: ${input.wallet.toLowerCase()}`,
    `URI: https://zenzen.fun`,
    `Version: 1`,
    input.chainId != null ? `Chain ID: ${input.chainId}` : null,
    `Nonce: ${input.nonce}`,
    `Issued At: ${new Date(input.timestamp).toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function readAll(): Record<string, WalletSession> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, WalletSession>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readSession(wallet: string | null | undefined): WalletSession | null {
  if (!wallet) return null;
  const row = readAll()[wallet.toLowerCase()];
  if (!row) return null;
  if (Date.now() - Number(row.timestamp) > TTL_MS) return null;
  if (row.wallet.toLowerCase() !== wallet.toLowerCase()) return null;
  if (!row.signature || !row.nonce) return null;
  return row;
}

export function writeSession(session: WalletSession) {
  if (typeof window === "undefined") return;
  try {
    const all = readAll();
    all[session.wallet.toLowerCase()] = session;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // private mode
  }
}

export function clearSession(wallet?: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!wallet) {
      localStorage.removeItem(KEY);
      return;
    }
    const all = readAll();
    delete all[wallet.toLowerCase()];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // private mode
  }
}
