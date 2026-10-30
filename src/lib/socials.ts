/** Normalize optional launch socials. Empty or junk becomes "". */

export function cleanSocial(raw: unknown, kind: "web" | "x" | "tg"): string {
  const v = String(raw ?? "").trim().slice(0, 160);
  if (!v) return "";
  if (kind === "web") {
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      if (!u.hostname.includes(".")) return "";
      return u.href.slice(0, 200);
    } catch {
      return "";
    }
  }
  if (kind === "x") {
    const handle = v
      .replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, "")
      .replace(/^@/, "")
      .split(/[/?#]/)[0]
      .trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return "";
    return `https://x.com/${handle}`;
  }
  const handle = v
    .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) return "";
  return `https://t.me/${handle}`;
}

const SOCIAL_LABEL = { web: "Website", x: "X", tg: "Telegram" } as const;

/** Empty is allowed. A filled field must clean to a real link. */
export function readSocial(
  raw: unknown,
  kind: "web" | "x" | "tg",
): { ok: true; value: string } | { ok: false; error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: "" };
  const value = cleanSocial(text, kind);
  if (!value) return { ok: false, error: `${SOCIAL_LABEL[kind]} is not a valid link.` };
  return { ok: true, value };
}

/** Zenzen's Telegram community group handle. Change it here only; every Telegram link reads it. */
export const ZENZEN_TELEGRAM_HANDLE = "zenzefun";
export const ZENZEN_TELEGRAM_URL = `https://t.me/${ZENZEN_TELEGRAM_HANDLE}`;

/** Zenzen's own public links. */
export const ZENZEN_LINKS = {
  x: "https://x.com/getzenzen",
  telegram: ZENZEN_TELEGRAM_URL,
  github: "https://github.com/Zenzefun/zenze",
} as const;
