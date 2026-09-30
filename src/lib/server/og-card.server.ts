import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { displayTokenArt, isBrandTokenArt, isIpfsArt } from "@/lib/image-art";
import { CHAINS, type ChainKey } from "@/lib/chains";

const CACHE = new Map<string, { buf: Buffer; at: number }>();
const TTL_MS = 10 * 60_000;
const SCRIPT = join(process.cwd(), "scripts/render-og-card.py");

export type CardKind = "home" | "znzf" | "token" | "page";

function staticCard(kind: "home" | "znzf"): Buffer | null {
  const rel = kind === "znzf" ? "public/znzf-og.jpg" : "public/og.jpg";
  const path = join(process.cwd(), rel);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

function runPython(args: string[], outFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("python3", [SCRIPT, ...args, "--out", outFile], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 12_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && existsSync(outFile));
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function cacheGet(key: string): Buffer | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.buf;
}

function cacheSet(key: string, buf: Buffer) {
  CACHE.set(key, { buf, at: Date.now() });
}

export async function renderOgCard(opts: {
  kind: CardKind;
  name?: string;
  symbol?: string;
  chain?: string;
  art?: string | null;
  title?: string;
  tagline?: string;
}): Promise<Buffer> {
  const key = createHash("sha1")
    .update(
      JSON.stringify({
        k: opts.kind,
        n: opts.name ?? "",
        s: opts.symbol ?? "",
        c: opts.chain ?? "",
        a: (opts.art ?? "").slice(0, 180),
        t: opts.title ?? "",
        g: opts.tagline ?? "",
      }),
    )
    .digest("hex");
  const cached = cacheGet(key);
  if (cached) return cached;

  const dir = join(tmpdir(), "zenze-og");
  mkdirSync(dir, { recursive: true });
  const outFile = join(dir, `${key}.jpg`);
  const args = ["--mode", opts.kind];
  if (opts.name) args.push("--name", opts.name);
  if (opts.symbol) args.push("--symbol", opts.symbol);
  if (opts.chain) args.push("--chain", opts.chain);
  if (opts.art) args.push("--art", opts.art);
  if (opts.title) args.push("--title", opts.title);
  if (opts.tagline) args.push("--tagline", opts.tagline);

  const ok = existsSync(SCRIPT) ? await runPython(args, outFile) : false;
  if (ok) {
    const buf = readFileSync(outFile);
    cacheSet(key, buf);
    return buf;
  }

  const fallback = staticCard(opts.kind === "znzf" ? "znzf" : "home");
  if (fallback) {
    cacheSet(key, fallback);
    return fallback;
  }
  throw new Error("Share card could not be rendered.");
}

export async function cardForTokenId(id: string): Promise<Buffer> {
  const safe = id.trim().toLowerCase().slice(0, 80);
  if (!/^[a-z0-9_-]+$/.test(safe)) return renderOgCard({ kind: "home" });
  if (safe === "znzf") return renderOgCard({ kind: "znzf", name: "Zenze", symbol: "ZNZF", chain: "Robinhood Chain" });
  try {
    const sql = await getSql();
    const rows = await sql<{ name: string; symbol: string; description: string; image_url: string; chain: string }>`
      select name, symbol, description, image_url, chain from tokens where id = ${safe} limit 1
    `;
    const row = rows[0];
    if (!row) return renderOgCard({ kind: "home" });
    const chain = CHAINS[row.chain as ChainKey]?.name ?? row.chain;
    const art = displayTokenArt(row.image_url);
    const safeArt = row.symbol === "ZNZF" || isIpfsArt(art) ? art : isBrandTokenArt(art) ? undefined : art.startsWith("http") || art.startsWith("data:") ? art : undefined;
    return renderOgCard({
      kind: "token",
      name: row.name,
      symbol: row.symbol,
      chain,
      art: safeArt && (safeArt.startsWith("data:") || safeArt.startsWith("http") || safeArt.startsWith("/")) ? safeArt : undefined,
    });
  } catch {
    return renderOgCard({ kind: "home" });
  }
}

export function jpegHeaders(cacheSeconds = 3600): HeadersInit {
  return {
    "content-type": "image/jpeg",
    "cache-control": `public, max-age=${cacheSeconds}, stale-while-revalidate=86400`,
    "x-content-type-options": "nosniff",
  };
}
