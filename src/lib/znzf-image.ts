import brand from "./ipfs-brand.json";

/** Canonical $ZNZF mark on public IPFS (content-addressed PNG). */
export const ZNZF_IPFS_CID = brand.znzfPng;
export const ZNZF_IPFS_META_CID = brand.znzfMeta;
export const ZNZF_IPFS_GATEWAY = `${brand.gateway}/ipfs/${brand.znzfPng}`;
export const ZNZF_IPFS_URI = `ipfs://${brand.znzfPng}`;
export const ZNZF_IPFS_META = `${brand.gateway}/ipfs/${brand.znzfMeta}`;

export function znzfTokenImage(src?: string | null): string {
  const v = (src ?? "").trim();
  if (/\/ipfs\//i.test(v) || v.startsWith("ipfs://")) return v.startsWith("ipfs://") ? ZNZF_IPFS_GATEWAY : v;
  return ZNZF_IPFS_GATEWAY;
}
