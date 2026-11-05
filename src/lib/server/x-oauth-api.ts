import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { isHexAddress } from "@/lib/intent";
import { beginXAuthorize, xOAuthConfig } from "@/lib/server/x-oauth.server";

export const startXOauth = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    return beginXAuthorize(wallet);
  });

export const xOAuthReady = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = await xOAuthConfig();
  return { ready: cfg.ready, handle: cfg.handle };
});

export const xLinkStatus = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { handle: null as string | null, follows: false };
    const sql = await getSql();
    const rows = await sql<{ x_handle: string | null; x_follow_ok: boolean }>`
      select x_handle, x_follow_ok from airdrop_wallets
      where wallet = ${wallet}
      limit 1
    `;
    const row = rows[0];
    return { handle: row?.x_handle ?? null, follows: Boolean(row?.x_follow_ok) };
  });
