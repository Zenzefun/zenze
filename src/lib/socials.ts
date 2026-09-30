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
      .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
      .replace(/^@/, "")
      .split(/[/?#]/)[0]
      .trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return "";
    return `https://x.com/${handle}`;
  }
  const handle = v
    .replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) return "";
  return `https://t.me/${handle}`;
}
