/** On-chain ERC-20 names. Empty or placeholder names show as "Unnamed Token" in wallets. */

const UNNAMED = /^(unnamed(\s+token)?|unknown(\s+token)?|n\/?a|null|undefined|token)$/i;

export function cleanTokenName(raw: unknown, fallback = ""): string {
  const name = String(raw ?? "")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
  if (!name || UNNAMED.test(name)) return fallback.trim().slice(0, 32);
  return name;
}

export function cleanTokenSymbol(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\0/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

export function isBlankTokenName(raw: unknown): boolean {
  return !cleanTokenName(raw);
}

export function isUnnamedTokenName(raw: unknown): boolean {
  const name = String(raw ?? "")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return !name || UNNAMED.test(name);
}

type TokenMeta =
  | { ok: true; name: string; symbol: string }
  | { ok: false; error: string };

/** Validate name + ticker before they are written to the factory. */
export function parseTokenMeta(nameRaw: unknown, symbolRaw: unknown): TokenMeta {
  const symbol = cleanTokenSymbol(symbolRaw).slice(0, 8);
  if (isUnnamedTokenName(nameRaw)) {
    return { ok: false, error: "Name cannot be Unnamed Token. Wallets would show that on-chain." };
  }
  const name = cleanTokenName(nameRaw);
  if (name.length < 2) return { ok: false, error: "Give the token a real name (at least 2 characters)." };
  if (isUnnamedTokenName(name)) return { ok: false, error: "Name cannot be Unnamed Token." };
  if (symbol.length < 2) return { ok: false, error: "Ticker must be 2–8 letters or numbers." };
  if (symbol === "ZNZF") return { ok: false, error: "$ZNZF is reserved." };
  return { ok: true, name, symbol };
}
