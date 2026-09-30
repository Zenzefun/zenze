const MAX_CHARS = 180_000;
const DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
/** CIDv0 (Qm…) and CIDv1 raw/dag-pb (bafkrei…, bafybei…, bafm…). */
export const IPFS_CID = "(Qm[1-9A-HJ-NP-Za-km-z]{44,128}|baf[kmy][a-z0-9]{50,128})";
const IPFS_URI = new RegExp(`^ipfs://${IPFS_CID}(/[-A-Za-z0-9._/]*)?$`, "i");
const PUBLIC_GATEWAY = new RegExp(
  `^https://(gateway\\.pinata\\.cloud|ipfs\\.io|cloudflare-ipfs\\.com|dweb\\.link)/ipfs/${IPFS_CID}(/[-A-Za-z0-9._]*)?$`,
  "i",
);
const PINATA_DEDICATED = new RegExp(
  `^https://[a-z0-9-]+\\.mypinata\\.cloud/ipfs/${IPFS_CID}(/[-A-Za-z0-9._]*)?$`,
  "i",
);

const CID_ONLY = new RegExp(`^${IPFS_CID}$`, "i");

export function isIpfsCid(value: string): boolean {
  return CID_ONLY.test(value.trim());
}

export function isBrandTokenArt(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.includes("/brand/") || v.includes("capy-mark") || v.includes("capy-zen") || v.includes("capybara");
}

export function isIpfsArt(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (isBrandTokenArt(v)) return false;
  return IPFS_URI.test(v) || PUBLIC_GATEWAY.test(v) || PINATA_DEDICATED.test(v) || isIpfsCid(v);
}

/** Uploaded crop (data URL) or already-pinned IPFS. Never a Zenze brand asset. */
export function isTokenArt(value: string): boolean {
  const v = value.trim();
  if (!v || isBrandTokenArt(v)) return false;
  if (v.startsWith("data:image/") && DATA.test(v) && v.length <= MAX_CHARS && v.length > 40) return true;
  return isIpfsArt(v);
}

const DISPLAY_GATEWAY = "https://copper-cheerful-mite-422.mypinata.cloud";

/** Turn ipfs:// CIDs into a fetchable gateway URL. Local and data URLs pass through. */
export function displayTokenArt(value: string): string {
  const v = value.trim();
  const m = v.match(/^ipfs:\/\/([A-Za-z0-9]+)(\/.*)?$/i);
  if (m && isIpfsCid(m[1])) return `${DISPLAY_GATEWAY}/ipfs/${m[1]}${m[2] ?? ""}`;
  return v;
}

/** Public token art that is safe to render. Brand assets are never a token's face. */
export function publicTokenArt(value: string, protocol = false): string {
  const v = value.trim();
  if (!v) return "";
  if (protocol) return displayTokenArt(v);
  if (isBrandTokenArt(v)) return "";
  if (isIpfsArt(v) || v.startsWith("data:image/")) return displayTokenArt(v);
  return "";
}

export async function fileToTokenArt(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Upload a PNG, JPG, or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB before compression.");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, 512, 512);
  bitmap.close();
  let quality = 0.86;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_CHARS && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > MAX_CHARS) throw new Error("That image is still too large after compression. Try a simpler photo.");
  return out;
}
