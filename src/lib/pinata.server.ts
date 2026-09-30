import { displayTokenArt, isBrandTokenArt, isIpfsArt, isIpfsCid, isTokenArt } from "./image-art";
import { configValue } from "./server/secrets";

const DEFAULT_GATEWAY = "https://copper-cheerful-mite-422.mypinata.cloud";

async function gatewayBase(): Promise<string> {
  const g = (await configValue("pinata_gateway"))?.replace(/\/$/, "");
  if (g && /^https:\/\/[a-z0-9.-]+$/i.test(g)) return g;
  return DEFAULT_GATEWAY;
}

export async function pinataConfigured(): Promise<boolean> {
  return Boolean(await configValue("pinata_jwt"));
}

async function jwt(): Promise<string | undefined> {
  return configValue("pinata_jwt");
}

async function gatewayUrl(cid: string): Promise<string> {
  return `${await gatewayBase()}/ipfs/${cid}`;
}

type PinOk = { cid: string };
type PinErr = { error: string };

async function pinV3(token: string, buf: Buffer, mime: string, filename: string, signal: AbortSignal): Promise<PinOk | PinErr> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
  form.append("network", "public");
  form.append("name", filename);
  form.append("keyvalues", JSON.stringify({ app: "zenze.fun", kind: "token-art" }));
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal,
  });
  if (!res.ok) return { error: `v3 ${res.status}` };
  const json = (await res.json()) as { data?: { cid?: string } };
  const cid = json.data?.cid?.trim();
  if (!cid || !isIpfsCid(cid)) return { error: "v3 cid" };
  return { cid };
}

async function pinLegacy(token: string, buf: Buffer, mime: string, filename: string, signal: AbortSignal): Promise<PinOk | PinErr> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), filename);
  form.append("pinataMetadata", JSON.stringify({ name: filename, keyvalues: { app: "zenze.fun", kind: "token-art" } }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal,
  });
  if (!res.ok) return { error: `legacy ${res.status}` };
  const json = (await res.json()) as { IpfsHash?: string };
  const cid = json.IpfsHash?.trim();
  if (!cid || !isIpfsCid(cid)) return { error: "legacy cid" };
  return { cid };
}

/**
 * Pin a cropped data URL to public IPFS when Pinata is set.
 * Returns the gateway URL on success, or the original data URL if pin is skipped.
 */
export async function persistTokenArt(src: string): Promise<string> {
  const value = src.trim();
  if (isBrandTokenArt(value)) return "";
  if (!isTokenArt(value)) return value;
  if (isIpfsArt(value) || value.startsWith("ipfs://")) return displayTokenArt(value);
  if (!value.startsWith("data:image/")) return value;

  const token = await jwt();
  if (!token) return value;

  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/);
  if (!match) return value;
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const mime = match[1] === "jpeg" ? "image/jpeg" : `image/${match[1]}`;
  let buf: Buffer;
  try {
    buf = Buffer.from(match[2], "base64");
  } catch {
    return value;
  }
  if (buf.byteLength < 32 || buf.byteLength > 2_000_000) return value;

  const filename = `zenze-token.${ext}`;
  try {
    const signal = AbortSignal.timeout(20_000);
    const primary = await pinV3(token, buf, mime, filename, signal);
    const result = "cid" in primary ? primary : await pinLegacy(token, buf, mime, filename, signal);
    if ("cid" in result) return gatewayUrl(result.cid);
    console.warn("[pinata] pin skipped:", result.error);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "pin failed";
    console.warn("[pinata] pin skipped:", msg);
  }
  return value;
}

/** Launch/list require a public IPFS CID. Data URLs and brand assets are rejected. */
export async function persistTokenArtRequired(src: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (isBrandTokenArt(src)) return { ok: false, error: "Upload the token’s own image." };
  if (!isTokenArt(src)) return { ok: false, error: "Upload a token image (PNG, JPG, or WebP)." };
  const url = await persistTokenArt(src);
  if (!isIpfsArt(url) && !url.startsWith("ipfs://")) {
    return { ok: false, error: "Could not save that image. Try another file in a moment." };
  }
  return { ok: true, url: displayTokenArt(url) };
}

async function pinBytes(buf: Buffer, mime: string, filename: string): Promise<string | null> {
  const token = await jwt();
  if (!token) return null;
  if (buf.byteLength < 32 || buf.byteLength > 2_000_000) return null;
  try {
    const signal = AbortSignal.timeout(20_000);
    const primary = await pinV3(token, buf, mime, filename, signal);
    const result = "cid" in primary ? primary : await pinLegacy(token, buf, mime, filename, signal);
    if ("cid" in result) return gatewayUrl(result.cid);
    console.warn("[pinata] pin skipped:", result.error);
  } catch (err) {
    console.warn("[pinata] pin skipped:", err instanceof Error ? err.message : "pin failed");
  }
  return null;
}

/** Pin a JSON document to public IPFS. */
export async function pinJsonFile(value: unknown, filename: string): Promise<string | null> {
  const body = JSON.stringify(value);
  const buf = Buffer.from(body, "utf8");
  return pinBytes(buf, "application/json", filename);
}
export async function pinBrandFile(relFromPublic: string, filename: string, mime: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const roots = [join(process.cwd(), "public"), join(process.cwd(), ".output", "public")];
  for (const root of roots) {
    try {
      const buf = await readFile(join(root, relFromPublic));
      const url = await pinBytes(buf, mime, filename);
      if (url) return url;
    } catch {
      // try next root
    }
  }
  return null;
}
