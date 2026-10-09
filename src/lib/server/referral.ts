import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { inviteUrl } from "@/lib/referral";
import { isHexAddress } from "@/lib/intent";
import { operatorMiddleware } from "@/lib/operator-middleware";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function codeFor(wallet: string) {
  let n = BigInt(`0x${wallet.slice(2, 14)}`);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[Number(n % 31n)];
    n /= 31n;
  }
  return out;
}

async function db() {
  const sql = await getSql();
  try {
    await sql`
      create table if not exists referral_codes (
        code text primary key,
        wallet text not null unique,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists referral_events (
        id bigserial primary key,
        code text not null,
        kind text not null,
        wallet text not null,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create unique index if not exists referral_visit_once
        on referral_events (code, wallet)
        where kind = 'visit'
    `;
  } catch {
    // The tables already exist. This role cannot recreate them.
  }
  return sql;
}

export const myReferralCode = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    const sql = await db();
    const existing = await sql<{ code: string }>`select code from referral_codes where wallet = ${wallet} limit 1`;
    if (existing[0]) return { ok: true as const, code: existing[0].code, url: inviteUrl(existing[0].code) };
    let code = codeFor(wallet);
    for (let i = 0; i < 5; i += 1) {
      const clash = await sql<{ wallet: string }>`select wallet from referral_codes where code = ${code} limit 1`;
      if (!clash[0] || clash[0].wallet === wallet) break;
      code = `${codeFor(wallet)}${i + 2}`.slice(0, 8);
    }
    await sql`
      insert into referral_codes (code, wallet) values (${code}, ${wallet})
      on conflict (wallet) do nothing
    `;
    const row = await sql<{ code: string }>`select code from referral_codes where wallet = ${wallet} limit 1`;
    const saved = row[0]?.code ?? code;
    return { ok: true as const, code: saved, url: inviteUrl(saved) };
  });

export const recordReferral = createServerFn({ method: "POST" })
  .validator((input: { code?: string; kind?: string; wallet?: string }) => input)
  .handler(async ({ data }) => {
    const code = (data.code ?? "").trim().toLowerCase();
    const kind = data.kind === "launch" || data.kind === "buy" || data.kind === "visit" ? data.kind : "";
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!/^[a-z0-9]{4,12}$/.test(code) || !kind || !isHexAddress(wallet)) return { ok: false as const };
    const sql = await db();
    const owner = await sql<{ wallet: string }>`select wallet from referral_codes where code = ${code} limit 1`;
    if (!owner[0] || owner[0].wallet === wallet) return { ok: false as const };
    if (kind === "visit") {
      await sql`
        insert into referral_events (code, kind, wallet) values (${code}, 'visit', ${wallet})
        on conflict do nothing
      `;
    } else {
      await sql`insert into referral_events (code, kind, wallet) values (${code}, ${kind}, ${wallet})`;
    }
    return { ok: true as const };
  });

export const referralDesk = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const sql = await db();
    try {
      const rows = await sql<{ code: string; wallet: string; visits: number; launches: number; buys: number }>`
        select c.code, c.wallet,
               count(e.id) filter (where e.kind = 'visit')::int as visits,
               count(e.id) filter (where e.kind = 'launch')::int as launches,
               count(e.id) filter (where e.kind = 'buy')::int as buys
        from referral_codes c
        left join referral_events e on e.code = c.code
        group by c.code, c.wallet
        order by buys desc, launches desc, visits desc
        limit 30
      `;
      return rows;
    } catch {
      return [];
    }
  });
