import { getRequest } from "@tanstack/react-start/server";

/** Free, keyless endpoints only. Nothing here costs money or needs a secret. */
const IMAGE_BASE = "https://image.pollinations.ai/prompt/";
const TEXT_BASE = "https://text.pollinations.ai/";
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const TEXT_MAX_CHARS = 4000;

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const HOUR = 60 * 60_000;

function take(key: string, limit: number) {
  const now = Date.now();
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < HOUR);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    return false;
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 20_000) {
    for (const [k, v] of buckets) if (!v.hits.some((t) => now - t < HOUR)) buckets.delete(k);
  }
  return true;
}

export const LIMITS = {
  image: { perClient: 10, global: 300 },
  text: { perClient: 20, global: 600 },
} as const;

export function clientIp(): string {
  try {
    const req = getRequest();
    const h = req.headers;
    const ip = h.get("cf-connecting-ip") || h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0] || "";
    return ip.trim().slice(0, 64) || "unknown";
  } catch {
    return "unknown";
  }
}

/** Per IP, per wallet (when given), and one global cap. All three must pass. */
export function allowFreeAi(kind: keyof typeof LIMITS, wallet?: string): boolean {
  const lim = LIMITS[kind];
  const ip = clientIp();
  const w = (wallet ?? "").toLowerCase();
  const keys: Array<[string, number]> = [[`${kind}:ip:${ip}`, lim.perClient], [`${kind}:global`, lim.global]];
  if (/^0x[a-f0-9]{40}$/.test(w)) keys.push([`${kind}:w:${w}`, lim.perClient]);
  // check first, then consume, so a rejected call does not burn another bucket
  const now = Date.now();
  for (const [k, l] of keys) {
    const b = buckets.get(k);
    if (b && b.hits.filter((t) => now - t < HOUR).length >= l) return false;
  }
  for (const [k, l] of keys) take(k, l);
  return true;
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "zenzen.fun launch helper" } });
  } finally {
    clearTimeout(timer);
  }
}

export function imagePrompt(name: string, symbol: string, description: string) {
  const base = `Token logo for ${name} ($${symbol}). ${description}`.replace(/\s+/g, " ").trim().slice(0, 300);
  return `${base}. Round mascot icon, bold flat colors, centered, simple background, no text`;
}

/** Returns a data URI of the image, or an error. Caller re-runs it through the upload path. */
export async function pollinationsImage(prompt: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `${IMAGE_BASE}${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${seed}`;
  try {
    const deadline = Date.now() + 20_000;
    let res = await fetchWithTimeout(url, 20_000);
    // Pollinations sheds load with 429/5xx; one retry inside the same 20s budget.
    if ((res.status === 429 || res.status >= 500) && deadline - Date.now() > 4_000) {
      await new Promise((r) => setTimeout(r, 1_000));
      res = await fetchWithTimeout(url.replace(/seed=\d+/, `seed=${seed + 1}`), deadline - Date.now());
    }
    if (!res.ok) return { ok: false, error: `Image service answered ${res.status}.` };
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return { ok: false, error: "Image service did not return an image." };
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > IMAGE_MAX_BYTES) return { ok: false, error: "Image was too large." };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > IMAGE_MAX_BYTES) return { ok: false, error: "Image was empty or too large." };
    return { ok: true, dataUrl: `data:${type};base64,${buf.toString("base64")}` };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "Image service timed out." : "Image service is not reachable." };
  }
}

export function sanitizeDescription(raw: string, max = 240): string {
  let t = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\b[a-z0-9-]+\.(?:com|io|xyz|fun|net|org|app|gg|co|ai|me)(?:\/\S*)?/gi, "")
    .replace(/[*_`#>~|]/g, "")
    .replace(/#\w+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "");
  if (t.length > max) {
    t = t.slice(0, max);
    const cut = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "));
    t = cut > max / 2 ? t.slice(0, cut + 1) : `${t.slice(0, t.lastIndexOf(" ") > 0 ? t.lastIndexOf(" ") : max).trim()}…`;
  }
  return t;
}

export async function pollinationsText(prompt: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await fetchWithTimeout(`${TEXT_BASE}${encodeURIComponent(prompt.slice(0, 900))}`, 25_000);
    if (!res.ok) return { ok: false, error: `Text service answered ${res.status}.` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type && !type.startsWith("text/") && !type.includes("json")) return { ok: false, error: "Text service sent something else." };
    const raw = (await res.text()).slice(0, TEXT_MAX_CHARS);
    const text = sanitizeDescription(raw);
    if (text.length < 8) return { ok: false, error: "Text service sent nothing usable." };
    return { ok: true, text };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: aborted ? "Text service timed out." : "Text service is not reachable." };
  }
}
