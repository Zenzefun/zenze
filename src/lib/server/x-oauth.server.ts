import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { configValue } from "@/lib/server/secrets";

const REDIRECT = "https://zenze.fun/api/x/callback";
const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";

export async function xOAuthConfig() {
  const id = (await configValue("x_oauth_client_id"))?.trim() || (await configValue("x_api_key"))?.trim() || "";
  const secret = (await configValue("x_oauth_client_secret"))?.trim() || (await configValue("x_api_secret"))?.trim() || "";
  const handle = ((await configValue("x_handle")) ?? "ZenzeFun").replace(/^@/, "");
  return { id, secret, handle, redirect: REDIRECT, ready: Boolean(id) };
}

export async function beginXAuthorize(wallet: string) {
  const cfg = await xOAuthConfig();
  if (!cfg.id) return { ok: false as const, error: "The X app is not connected yet. Add the OAuth client id in Settings." };
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const sql = await getSql();
  await sql`
    create table if not exists x_oauth_states (
      state text primary key,
      wallet text not null,
      verifier text not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`delete from x_oauth_states where created_at < now() - interval '20 minutes'`;
  await sql`insert into x_oauth_states (state, wallet, verifier) values (${state}, ${wallet}, ${verifier})`;
  const url = new URL(AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.id);
  url.searchParams.set("redirect_uri", REDIRECT);
  url.searchParams.set("scope", "users.read follows.read");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { ok: true as const, url: url.toString() };
}

async function tokenFor(code: string, verifier: string, id: string, secret: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
    client_id: id,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (secret) headers.authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const res = await fetch(TOKEN_URL, { method: "POST", headers, body });
  const json = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `X token ${res.status}`);
  }
  return json.access_token;
}

export async function finishXAuthorize(code: string, state: string) {
  const sql = await getSql();
  await sql`
    create table if not exists airdrop_wallets (
      wallet text primary key,
      x_handle text,
      telegram_user_id text,
      telegram_ok boolean not null default false,
      created_at timestamptz not null default now()
    )
  `;
  await sql`alter table airdrop_wallets add column if not exists x_user_id text`.catch(() => undefined);
  await sql`alter table airdrop_wallets add column if not exists x_follow_ok boolean not null default false`.catch(() => undefined);
  const rows = await sql<{ wallet: string; verifier: string }>`
    select wallet, verifier from x_oauth_states where state = ${state} limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, error: "That X connection expired. Start it again." };
  await sql`delete from x_oauth_states where state = ${state}`;
  const cfg = await xOAuthConfig();
  if (!cfg.id) return { ok: false as const, error: "The X app is not connected yet." };
  const access = await tokenFor(code, row.verifier, cfg.id, cfg.secret);
  const headers = { authorization: `Bearer ${access}` };
  const meRes = await fetch("https://api.x.com/2/users/me", { headers });
  const me = (await meRes.json()) as { data?: { id?: string; username?: string } };
  const userId = me.data?.id ?? "";
  const username = me.data?.username ?? "";
  if (!meRes.ok || !userId || !username) return { ok: false as const, error: "X did not return this account." };
  const followRes = await fetch(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(cfg.handle)}?user.fields=connection_status`,
    { headers },
  );
  const follow = (await followRes.json()) as { data?: { connection_status?: string[] } };
  const follows = (follow.data?.connection_status ?? []).includes("following");
  const wallet = row.wallet.toLowerCase();
  await sql`
    update airdrop_wallets
    set x_follow_ok = false, x_user_id = null, x_handle = null
    where x_user_id = ${userId} and wallet <> ${wallet}
  `;
  await sql`
    insert into airdrop_wallets (wallet, x_handle, x_user_id, x_follow_ok)
    values (${wallet}, ${username}, ${userId}, ${follows})
    on conflict (wallet) do update
      set x_handle = excluded.x_handle,
          x_user_id = excluded.x_user_id,
          x_follow_ok = excluded.x_follow_ok
  `;
  return { ok: true as const, wallet, username, follows };
}
