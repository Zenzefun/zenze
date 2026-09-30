import { createServerFn } from "@tanstack/react-start";
import { verifyMessage } from "viem";
import { getSql } from "@/lib/db";
import { isHexAddress, walletIntentMessage } from "@/lib/intent";
import { TREASURY_WALLET, publishedConfig } from "@/lib/onchain";
import type { OperatorSession } from "@/lib/operator-session";
import type { AdminRole } from "@/lib/types";

/** Desk super admin. The claim signer stays the treasury wallet. */
const DESK_ADMIN = "0x4ea876ba2fe3a565344cbb127b381402d636f413";
const ADMIN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

class OperatorUnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function operatorAllowlist(): Promise<Set<string>> {
  const set = new Set<string>([TREASURY_WALLET, DESK_ADMIN]);
  const deployer = publishedConfig().deployer;
  if (deployer) set.add(deployer.toLowerCase());
  try {
    const sql = await getSql();
    const rows = await sql<{ wallet: string }>`select wallet from operator_wallets`;
    for (const row of rows) {
      if (isHexAddress(row.wallet)) set.add(row.wallet.toLowerCase());
    }
  } catch {
    // table may not exist yet on first boot
  }
  return set;
}

export async function isOperatorWallet(wallet: string): Promise<boolean> {
  const normalized = wallet.trim().toLowerCase();
  const allow = await operatorAllowlist();
  return allow.has(normalized);
}

export async function roleOfWallet(wallet: string): Promise<AdminRole> {
  const normalized = wallet.trim().toLowerCase();
  if (
    normalized === TREASURY_WALLET ||
    normalized === DESK_ADMIN ||
    normalized === publishedConfig().deployer?.toLowerCase()
  ) {
    return "super_admin";
  }
  try {
    const sql = await getSql();
    const rows = await sql<{ role: AdminRole }>`
      select role from operator_wallets where wallet = ${normalized} limit 1
    `;
    if (rows[0]?.role) return rows[0].role;
  } catch {
    // fall through
  }
  return "moderator";
}

export async function verifyOperatorSession(
  session?: OperatorSession | null,
): Promise<{ ok: true; wallet: string } | { ok: false; error: string }> {
  if (!session) return { ok: false, error: "Sign in with the operator wallet." };
  const wallet = session.wallet.trim().toLowerCase();
  if (!isHexAddress(wallet)) return { ok: false, error: "Connect a real wallet first." };
  if (typeof session.signature !== "string" || session.signature.length < 80) {
    return { ok: false, error: "Sign the desk request with your wallet." };
  }
  const ts = Number(session.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > ADMIN_MAX_AGE_MS) {
    return { ok: false, error: "Operator signature expired. Sign in again." };
  }
  const message = walletIntentMessage({
    action: "admin",
    wallet,
    tokenId: "desk",
    timestamp: ts,
  });
  try {
    const valid = await verifyMessage({
      address: wallet as `0x${string}`,
      message,
      signature: session.signature as `0x${string}`,
    });
    if (!valid) return { ok: false, error: "Wallet signature did not match." };
  } catch {
    return { ok: false, error: "Wallet signature did not match." };
  }
  if (!(await isOperatorWallet(wallet))) {
    return { ok: false, error: "This wallet does not open the desk. Use the treasury wallet." };
  }
  return { ok: true, wallet };
}

export async function requireOperator(session?: OperatorSession | null): Promise<string> {
  const verified = await verifyOperatorSession(session);
  if (!verified.ok) throw new OperatorUnauthorizedError();
  return verified.wallet;
}

export const startOperatorSession = createServerFn({ method: "POST" })
  .validator((input: OperatorSession) => input)
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const verified = await verifyOperatorSession(data);
    if (!verified.ok) return { ok: false as const, error: verified.error };
    const { writeOperatorCookie } = await import("@/lib/server/operator-cookie.server");
    writeOperatorCookie({
      wallet: verified.wallet,
      signature: data.signature,
      timestamp: data.timestamp,
    });
    const sql = await getSql();
    const role = await roleOfWallet(verified.wallet);
    await sql`
      insert into operator_wallets (wallet, role)
      values (${verified.wallet}, ${role})
      on conflict (wallet) do update set role = excluded.role
    `;
    await sql`
      insert into audit_logs (user_id, action, detail)
      values (${verified.wallet}, 'operator_login', ${verified.wallet})
    `;
    return { ok: true as const, wallet: verified.wallet, role };
  });

export const endOperatorSession = createServerFn({ method: "POST" }).handler(async () => {
  const { clearOperatorCookie } = await import("@/lib/server/operator-cookie.server");
  clearOperatorCookie();
  return { ok: true as const };
});
