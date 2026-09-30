import { createServerFn } from "@tanstack/react-start";
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";
import { getSql } from "@/lib/db";
import { isHexAddress } from "@/lib/intent";
import { isRetiredAddress, publishedConfig } from "@/lib/onchain";
import { pinataConfigured } from "@/lib/pinata.server";
import { operatorMiddleware } from "@/lib/operator-middleware";
import { roleOfWallet } from "@/lib/server/operator";
import { chainRpc, fromWei, readNativeBalance, readTokenBalance } from "@/lib/rpc.server";
import { loadDeskConfig, liveProtocolConfig, maskSecret, invalidateDeskConfig, isDeskConfigKey, isReownProjectId, isSecretConfigKey, PUBLIC_CONFIG_KEYS, CONTRACT_CONFIG_KEYS, FEE_CONFIG_KEYS, AUTO_CONFIG_KEYS, SECRET_CONFIG_KEYS } from "@/lib/server/secrets";
import { publishTweet, xHandle, xIntentUrl } from "@/lib/server/x";
import { fetchMentions, linkXSession, searchTweets, twitterapisConfigured, twitterapisPing, xCookiesReady, xSessionStatus } from "@/lib/server/twitterapis";
import { isRiverSpam } from "@/lib/server/x-engage";

import type { AdminRole } from "@/lib/types";

export const getOperator = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => {
    const role = await roleOfWallet(context.operatorWallet);
    return { wallet: context.operatorWallet, role };
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => {
    const role = await roleOfWallet(context.operatorWallet);
    const sql = await getSql();
    const tokens = await sql<{ n: number }>`select count(*)::int as n from tokens`;
    const posts = await sql<{ n: number }>`select count(*)::int as n from marketing_posts`;
    const queued = await sql<{ n: number }>`select count(*)::int as n from marketing_posts where status = 'queued'`;
    const operators = await sql<{ n: number }>`select count(*)::int as n from operator_wallets`;
    const logs = await sql<{ id: number; user_id: string; action: string; detail: string; created_at: string }>`
      select * from audit_logs order by created_at desc limit 16
    `;
    const configRows = await sql<{ key: string; value: string }>`select key, value from protocol_config`;
    const fees = await sql<{ v: string | number }>`select coalesce(sum(amount), 0) as v from znzf_events where kind in ('fee_eth', 'listing_fee')`;
    const withdrawn = await sql<{ v: string | number }>`select coalesce(sum(amount), 0) as v from withdrawals where status = 'sent'`;
    const pendingW = await sql<{ n: number }>`select count(*)::int as n from withdrawals where status = 'queued'`;
    let lastJob: { provider: string; model: string; kind: string; status: string; created_at: string } | null = null;
    try {
      const jobs = await sql<{ provider: string; model: string; kind: string; status: string; created_at: string }>`
        select provider, model, kind, status, created_at from ai_jobs order by created_at desc limit 1
      `;
      lastJob = jobs[0] ?? null;
    } catch {
      lastJob = null;
    }
    const desk = await loadDeskConfig();
    const visible: Record<string, string> = {};
    for (const row of configRows) {
      if (row.key === "admin_email" || row.key === "system_prompt") continue;
      if (isSecretConfigKey(row.key)) continue;
      if (row.value?.trim()) visible[row.key] = row.value;
    }
    for (const key of PUBLIC_CONFIG_KEYS) {
      if (desk[key]) visible[key] = desk[key];
    }
    for (const key of CONTRACT_CONFIG_KEYS) {
      if (desk[key]) visible[key] = desk[key];
    }
    for (const key of FEE_CONFIG_KEYS) {
      if (desk[key]) visible[key] = desk[key];
    }
    for (const key of AUTO_CONFIG_KEYS) {
      if (desk[key]) visible[key] = desk[key];
    }
    const keys: Record<string, { set: boolean; hint: string }> = {};
    for (const key of SECRET_CONFIG_KEYS) {
      keys[key] = maskSecret(desk[key]);
    }
    keys.reown_project_id = maskSecret(desk.reown_project_id);
    return {
      ok: true as const,
      role,
      wallet: context.operatorWallet,
      tokens: tokens[0]?.n ?? 0,
      posts: posts[0]?.n ?? 0,
      queued: queued[0]?.n ?? 0,
      operators: operators[0]?.n ?? 0,
      logs,
      feesAccrued: Number(fees[0]?.v ?? 0),
      withdrawn: Number(withdrawn[0]?.v ?? 0),
      pendingWithdrawals: pendingW[0]?.n ?? 0,
      lastJob,
      pinata: await pinataConfigured(),
      keys,
      config: {
        ...publishedConfig(),
        ...visible,
      },
    };
  });

export const listMarketing = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const sql = await getSql();
    type Row = {
      id: number;
      kind: string;
      content: string;
      status: string;
      token_id: string | null;
      created_at: string;
      request: string | null;
      research: string | null;
      x_post_id: string | null;
      published_at: string | null;
      provider: string | null;
      model: string | null;
      play: string | null;
      likes: number;
      score: string | number;
    };
    try {
      return await sql<Row>`
        select id, kind, content, status, token_id, created_at, request, research, x_post_id, published_at,
               provider, model, play, likes, score
        from marketing_posts order by created_at desc limit 40
      `;
    } catch {
      const rows = await sql<Omit<Row, "play" | "likes" | "score">>`
        select id, kind, content, status, token_id, created_at, request, research, x_post_id, published_at,
               provider, model
        from marketing_posts order by created_at desc limit 40
      `;
      return rows.map((r) => ({ ...r, play: null, likes: 0, score: 0 }));
    }
  });

export const markPostStatus = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number; status: "queued" | "posted" | "failed" }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql`update marketing_posts set status = ${data.status} where id = ${data.id}`;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'marketing_status', ${`${data.id}:${data.status}`})`;
    return { ok: true as const };
  });

export const runXPulse = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => {
    const { runAutonomousPulse } = await import("@/lib/server/autonomous-x");
    const result = await runAutonomousPulse("desk");
    const sql = await getSql();
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'x_pulse', ${result.play + (result.posted ? ":posted" : ":skip")})`;
    return result;
  });

export const publishQueuedPost = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number; content: string }>`
      select id, content from marketing_posts where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "Draft not found." };
    const posted = await publishTweet(row.content);
    if (posted.ok) {
      await sql`
        update marketing_posts
           set status = 'posted', x_post_id = ${posted.id}, published_at = now()
         where id = ${data.id}
      `;
      await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'marketing_publish', ${`${data.id}:${posted.id}`})`;
      return { ok: true as const, id: posted.id, intent: xIntentUrl(row.content) };
    }
    await sql`update marketing_posts set status = 'queued' where id = ${data.id}`;
    return { ok: false as const, error: posted.error, intent: posted.intent };
  });

export const saveConfig = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { key: string; value: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await roleOfWallet(context.operatorWallet);
    if (role !== "super_admin") return { ok: false as const, error: "Super admin only." };
    const key = data.key.trim();
    if (!isDeskConfigKey(key)) {
      return { ok: false as const, error: "Unknown setting." };
    }
    let value = data.value;
    if (isSecretConfigKey(key) && !value.trim()) {
      return { ok: true as const };
    }
    if (key === "reown_project_id") {
      value = value.trim();
      if (value && !isReownProjectId(value)) {
        return { ok: false as const, error: "Reown Project ID is 32 hex characters from dashboard.reown.com." };
      }
    }
    if (
      key === "maintenance" ||
      key === "x_auto_on" ||
      key === "x_auto_replies_on_our_posts" ||
      key === "x_auto_follows" ||
      key === "x_auto_quotes" ||
      key === "telegram_auto_on"
    ) {
      value = value === "true" || value === "1" || value === "on" ? "true" : "false";
    }
    if (key === "x_auto_minutes") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false as const, error: "Cadence must be minutes between 20 and 180." };
      }
      value = String(Math.min(180, Math.max(20, Math.round(n))));
    }
    if (key === "x_daily_likes" || key === "x_daily_follows" || key === "x_daily_reposts" || key === "x_daily_comments") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false as const, error: "Daily quota must be a number between 0 and 80." };
      }
      value = String(Math.min(80, Math.max(0, Math.round(n))));
    }
    if (key === "launch_fee_usd" || key === "listing_fee_usd") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 10_000) {
        return { ok: false as const, error: "Fee must be a USD amount between 0 and 10,000." };
      }
      value = String(n);
    }
    if (key === "telegram_bot_token") {
      value = value.trim();
      if (value && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(value)) {
        return { ok: false as const, error: "Telegram bot token looks wrong. Copy it from BotFather." };
      }
    }
    if (key === "telegram_chat_id") {
      value = value.trim();
      if (value && !/^-?\d+$/.test(value) && !/^@[A-Za-z][A-Za-z0-9_]{3,}$/.test(value)) {
        return { ok: false as const, error: "Telegram chat id is a number like -100… or an @username." };
      }
    }
    if (key === "treasury_address") {
      value = value.trim().toLowerCase();
      if (value && !isHexAddress(value)) {
        return { ok: false as const, error: "Treasury must be a wallet address." };
      }
    }
    if (isHexAddress(value) && isRetiredAddress(value)) {
      return { ok: false as const, error: "That address is not a live Zenze contract." };
    }
    const sql = await getSql();
    await sql`
      insert into protocol_config (key, value) values (${key}, ${value})
      on conflict (key) do update set value = excluded.value
    `;
    if (key === "znzf_curve_robinhood" && isHexAddress(value)) {
      await sql`
        update tokens
           set curve_address = ${value.toLowerCase()},
               graduated = false,
               source = 'launched'
         where id = 'znzf'
      `;
    }
    if (key === "znzf_robinhood" && isHexAddress(value)) {
      await sql`
        update tokens
           set contract_address = ${value.toLowerCase()}
         where id = 'znzf'
      `;
    }
    invalidateDeskConfig();
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'config', ${key})`;
    return { ok: true as const };
  });

export const listOperators = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const sql = await getSql();
    return sql<{ wallet: string; role: AdminRole; created_at: string }>`
      select wallet, role, created_at from operator_wallets order by created_at asc
    `;
  });

export const addOperatorWallet = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { wallet: string; role: AdminRole }) => input)
  .handler(async ({ data, context }) => {
    const role = await roleOfWallet(context.operatorWallet);
    if (role !== "super_admin") return { ok: false as const, error: "Super admin only." };
    const wallet = data.wallet.trim().toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Wallet must be a 0x address." };
    const nextRole: AdminRole = data.role === "moderator" || data.role === "analyst" ? data.role : "super_admin";
    const sql = await getSql();
    await sql`
      insert into operator_wallets (wallet, role)
      values (${wallet}, ${nextRole})
      on conflict (wallet) do update set role = excluded.role
    `;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'operator_add', ${`${wallet}:${nextRole}`})`;
    return { ok: true as const };
  });

export const listAdminTokens = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const sql = await getSql();
    return sql<{
      id: string;
      name: string;
      symbol: string;
      chain: string;
      holders: number;
      health_score: number;
      graduated: boolean;
      created_at: string;
      volume_24h: string;
      source: string;
      contract_address: string;
      image_url: string;
    }>`
      select id, name, symbol, chain, holders, health_score, graduated, created_at, volume_24h::text as volume_24h,
             coalesce(source, 'launched') as source, coalesce(contract_address, '') as contract_address,
             coalesce(image_url, '') as image_url
      from tokens order by created_at desc
    `;
  });

const TREASURY_VIEWS = parseAbi([
  "function feeVault() view returns (address)",
  "function owner() view returns (address)",
  "function totalBurned() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function realBase() view returns (uint256)",
  "function tokensSold() view returns (uint256)",
  "function virtualBase() view returns (uint256)",
  "function virtualTokens() view returns (uint256)",
  "function FEE_BPS() view returns (uint256)",
  "function BUYBACK_BPS() view returns (uint256)",
]);

type TreasuryView =
  | "feeVault"
  | "owner"
  | "totalBurned"
  | "totalSupply"
  | "graduated"
  | "realBase"
  | "tokensSold"
  | "virtualBase"
  | "virtualTokens"
  | "FEE_BPS"
  | "BUYBACK_BPS";

async function treasuryView(to: string, fn: TreasuryView) {
  const data = encodeFunctionData({ abi: TREASURY_VIEWS, functionName: fn });
  const raw = await chainRpc("robinhood", "eth_call", [{ to, data }, "latest"]);
  if (typeof raw !== "string") throw new Error(`Empty ${fn}`);
  return decodeFunctionResult({ abi: TREASURY_VIEWS, functionName: fn, data: raw as `0x${string}` });
}

async function readTreasuryChain() {
  const cfg = await liveProtocolConfig();
  const vault = cfg.vault_robinhood;
  const curve = cfg.znzf_curve_robinhood;
  const token = cfg.znzf_robinhood;
  const buyback = cfg.buyback_robinhood;
  const intake = cfg.intake_robinhood;
  const splitter = cfg.splitter_robinhood;
  if (!isHexAddress(vault) || !isHexAddress(curve) || !isHexAddress(token)) {
    throw new Error("Canonical vault, curve, or token is not published.");
  }
  const [vaultEth, curveEth, supply, realBase, tokensSold, virtualBase, virtualTokens, feeBps, graduated, curveFeeVault, buybackBps] =
    await Promise.all([
      readNativeBalance("robinhood", vault),
      readNativeBalance("robinhood", curve),
      treasuryView(token, "totalSupply") as Promise<bigint>,
      treasuryView(curve, "realBase") as Promise<bigint>,
      treasuryView(curve, "tokensSold") as Promise<bigint>,
      treasuryView(curve, "virtualBase") as Promise<bigint>,
      treasuryView(curve, "virtualTokens") as Promise<bigint>,
      treasuryView(curve, "FEE_BPS") as Promise<bigint>,
      treasuryView(curve, "graduated") as Promise<boolean>,
      treasuryView(curve, "feeVault") as Promise<string>,
      treasuryView(vault, "BUYBACK_BPS") as Promise<bigint>,
    ]);
  const feeVault = String(curveFeeVault).toLowerCase();
  const [vaultZnzf, feeVaultEth, feeVaultZnzf] = await Promise.all([
    readTokenBalance("robinhood", token, vault),
    readNativeBalance("robinhood", feeVault),
    readTokenBalance("robinhood", token, feeVault),
  ]);
  let buybackEth = 0;
  let burnedByBuyback = 0;
  let buybackOwner = "";
  let intakeEth = 0;
  let splitterEth = 0;
  if (isHexAddress(buyback)) {
    const [eth, burned, owner] = await Promise.all([
      readNativeBalance("robinhood", buyback),
      treasuryView(buyback, "totalBurned") as Promise<bigint>,
      treasuryView(buyback, "owner") as Promise<string>,
    ]);
    buybackEth = fromWei(eth, 18);
    burnedByBuyback = fromWei(burned, 18);
    buybackOwner = String(owner).toLowerCase();
  }
  if (isHexAddress(intake)) intakeEth = fromWei(await readNativeBalance("robinhood", intake), 18);
  if (isHexAddress(splitter)) splitterEth = fromWei(await readNativeBalance("robinhood", splitter), 18);
  return {
    chain: "robinhood" as const,
    vault,
    curve,
    token,
    buyback: isHexAddress(buyback) ? buyback : "",
    buybackOwner,
    intake: isHexAddress(intake) ? intake : "",
    splitter: isHexAddress(splitter) ? splitter : "",
    router: isHexAddress(cfg.router_robinhood) ? cfg.router_robinhood : "",
    curveFeeVault: feeVault,
    curveFeeVaultIsDesk: feeVault === vault,
    vaultEth: fromWei(vaultEth, 18),
    vaultZnzf: fromWei(vaultZnzf, 18),
    curveEth: fromWei(curveEth, 18),
    feeVaultEth: fromWei(feeVaultEth, 18),
    feeVaultZnzf: fromWei(feeVaultZnzf, 18),
    supply: fromWei(supply, 18),
    burned: Math.max(0, 1_000_000_000 - fromWei(supply, 18)),
    realBase: fromWei(realBase, 18),
    tokensSold: fromWei(tokensSold, 18),
    virtualBase: fromWei(virtualBase, 18),
    virtualTokens: fromWei(virtualTokens, 18),
    feeBps: Number(feeBps),
    buybackBps: Number(buybackBps),
    graduated: Boolean(graduated),
    buybackEth,
    intakeEth,
    splitterEth,
    burnedByBuyback,
  };
}

export const treasurySnapshot = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const sql = await getSql();
    const fees = await sql<{ kind: string; v: string | number }>`
      select kind, coalesce(sum(amount), 0) as v from znzf_events group by kind
    `;
    const withdrawals = await sql<{
      id: number;
      amount: string | number;
      dest: string;
      asset: string;
      status: string;
      note: string;
      created_by: string;
      created_at: string;
    }>`
      select id, amount, dest, asset, status, note, created_by, created_at
      from withdrawals order by created_at desc limit 40
    `;
    const refs = await sql<{ v: string | number }>`select coalesce(sum(amount), 0) as v from referrals`;
    const cfg = await sql<{ value: string }>`select value from protocol_config where key = 'treasury_address'`;
    const published = publishedConfig();
    let chain = null as Awaited<ReturnType<typeof readTreasuryChain>> | null;
    let chainError = "";
    try {
      chain = await readTreasuryChain();
    } catch (err) {
      chainError = err instanceof Error ? err.message : "Chain read failed.";
    }
    return {
      ok: true as const,
      byKind: Object.fromEntries(fees.map((r) => [r.kind, Number(r.v)])),
      withdrawals,
      referralAccrued: Number(refs[0]?.v ?? 0),
      treasuryAddress: cfg[0]?.value || published.deployer || "",
      chain,
      chainError,
    };
  });

export const queueWithdrawal = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { amount: number; dest: string; note: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await roleOfWallet(context.operatorWallet);
    if (role !== "super_admin") return { ok: false as const, error: "Super admin only." };
    const dest = data.dest.trim().toLowerCase();
    if (!isHexAddress(dest)) return { ok: false as const, error: "Treasury destination must be a wallet." };
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, error: "Amount must be positive." };
    const sql = await getSql();
    await sql`
      insert into withdrawals (amount, dest, asset, status, note, created_by)
      values (${amount}, ${dest}, 'ETH', 'queued', ${data.note.trim().slice(0, 200)}, ${context.operatorWallet})
    `;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'withdraw_queue', ${`${amount} -> ${dest}`})`;
    return { ok: true as const };
  });

export const markWithdrawal = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number; status: "sent" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    const role = await roleOfWallet(context.operatorWallet);
    if (role !== "super_admin") return { ok: false as const, error: "Super admin only." };
    const sql = await getSql();
    await sql`
      update withdrawals set status = ${data.status}, processed_at = now() where id = ${data.id} and status = 'queued'
    `;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'withdraw_mark', ${`${data.id}:${data.status}`})`;
    return { ok: true as const };
  });

export const xDesk = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const handle = await xHandle();
    let session = await xSessionStatus();
    const apis = await twitterapisConfigured();
    const ping = apis ? await twitterapisPing() : { ok: false, error: "TwitterAPIs key is not set." };
    if (apis && !session.ready && (await xCookiesReady())) {
      const linked = await linkXSession();
      if (linked.ok) session = await xSessionStatus();
    }
    const { autonomousStatus } = await import("@/lib/server/autonomous-x");
    const { ensurePulseLoop, pulseLoopStatus } = await import("@/lib/server/x-pulse-loop");
    ensurePulseLoop();
    const auto = await autonomousStatus();
    return { handle, apis, ping, auto, loop: pulseLoopStatus(), ...session };
  });

export const connectXSession = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => {
    const linked = await linkXSession();
    const sql = await getSql();
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'x_session', ${linked.ok ? linked.username ?? "ok" : linked.error})`;
    return linked;
  });

export const xRadar = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const handle = await xHandle();
    const [mentions, ticker] = await Promise.all([
      fetchMentions(handle),
      searchTweets("$ZNZF OR Zenze.fun OR @ZenzeFun"),
    ]);
    const seen = new Set<string>();
    const posts = [...mentions, ...ticker].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      if (p.author.toLowerCase() === handle.toLowerCase()) return false;
      return !isRiverSpam(p.text, p.author);
    });
    return { handle, posts: posts.slice(0, 16) };
  });

export const resolveMayaQueue = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number; status: "approved" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    let rows: {
      id: number;
      action: string;
      job: string;
      risk: string;
      segment: string;
      audience: string;
      reason: string;
      draft: string;
      handle: string;
      post_id: string;
      url: string;
      payload: unknown;
    }[] = [];
    try {
      rows = await sql`
        select id, action, job, risk, segment, audience, reason, draft, handle, post_id, url, payload
          from marketing_queue where id = ${data.id} and status = 'pending' limit 1
      `;
    } catch {
      return { ok: false as const, error: "Queue is not ready yet." };
    }
    const row = rows[0];
    if (!row) return { ok: false as const, error: "That card already moved." };
    if (data.status === "rejected") {
      await sql`update marketing_queue set status = 'rejected', resolved_at = now() where id = ${data.id}`;
      await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'maya_reject', ${String(data.id)})`;
      return { ok: true as const, skipped: "Rejected." };
    }
    const { observe } = await import("@/lib/server/maya/observe");
    const { executeItem, itemFromQueueRow } = await import("@/lib/server/maya/act");
    const { xHandle } = await import("@/lib/server/x");
    const obs = await observe(await xHandle());
    const result = await executeItem(itemFromQueueRow(row), obs);
    await sql`
      update marketing_queue
         set status = ${result.error ? "failed" : "executed"},
             error = ${result.error ?? null},
             resolved_at = now()
       where id = ${data.id}
    `;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'maya_approve', ${`${data.id}:${result.play}`})`;
    return { ok: !result.error, ...result };
  });
