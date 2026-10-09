import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { formatUnits } from "viem";
import { pointTotal, publicRules, rulesFromDesk, shareWei, spinFromRoll, UNIT, defaultDropRules, maxPoints, type DropRules } from "@/lib/airdrop-rules";
import { getSql } from "@/lib/db";
import { isHexAddress } from "@/lib/intent";
import { publishedConfig } from "@/lib/onchain";
import { operatorMiddleware } from "@/lib/operator-middleware";
import { configValue, invalidateDeskConfig, loadDeskConfig } from "@/lib/server/secrets";
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL, publicRoomUrl } from "@/lib/server/telegram";

const X = "https://x.com/ZenzeFun";

type WalletRow = {
  wallet: string;
  x_handle: string | null;
  telegram_user_id: string | null;
  telegram_ok: boolean;
  x_follow_ok: boolean;
  spin_wei: string | null;
};

async function db() {
  const sql = await getSql();
  const step = async (query: ReturnType<typeof sql>) => {
    try {
      await query;
    } catch {
      // The app role may not own a table created by the database owner.
    }
  };
  await step(sql`
    create table if not exists airdrop_wallets (
      wallet text primary key,
      x_handle text,
      telegram_user_id text,
      telegram_ok boolean not null default false,
      created_at timestamptz not null default now()
    )
  `);
  await step(sql`alter table airdrop_wallets add column if not exists x_user_id text`);
  await step(sql`alter table airdrop_wallets add column if not exists x_follow_ok boolean not null default false`);
  await step(sql`alter table airdrop_wallets add column if not exists spin_wei numeric`);
  await step(sql`alter table airdrop_wallets add column if not exists spin_at timestamptz`);
  await step(sql`
    create table if not exists airdrop_shares (
      wallet text primary key,
      points integer not null,
      share_wei numeric not null,
      frozen_at timestamptz not null default now()
    )
  `);
  return sql;
}

async function telegramAuth() {
  const token = (await configValue("telegram_bot_token"))?.trim() ?? "";
  const chat = (await configValue("telegram_chat_id"))?.trim() ?? "";
  return { token, chat };
}

async function botName() {
  const { token } = await telegramAuth();
  if (!token) return "";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    return json.ok && json.result?.username ? json.result.username : "";
  } catch {
    return "";
  }
}

async function memberOf(token: string, chat: string, userId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, user_id: Number(userId) }),
    });
    const json = (await res.json()) as { ok?: boolean; description?: string; result?: { status?: string } };
    if (!json.ok) {
      if (/not a member|kicked|chat not found|bot was/i.test(json.description ?? "")) return null;
      return false;
    }
    const status = json.result?.status ?? "";
    return ["creator", "administrator", "member", "restricted"].includes(status);
  } catch {
    return null;
  }
}

async function inRoom(userId: string) {
  const { token, chat } = await telegramAuth();
  if (!token || !userId) return false;
  const group = await memberOf(token, `@${COMMUNITY_GROUP}`, userId);
  if (group !== null) return group;
  if (!chat) return false;
  return (await memberOf(token, chat, userId)) === true;
}

async function actions(wallet: string, minTokens = 10_000) {
  const sql = await db();
  const launched = await sql<{ id: string }>`
    select id from tokens
    where lower(creator_wallet) = ${wallet} and id <> 'znzf'
    order by created_at desc
    limit 1
  `;
  const bought = await sql<{ ok: boolean }>`
    select true as ok from trades
    where lower(wallet) = ${wallet} and side = 'buy' and token_id = 'znzf'
    limit 1
  `;
  const seen = await sql<{ ok: boolean }>`
    select true as ok
    from tokens t
    join trades tr on tr.token_id = t.id
    where lower(t.creator_wallet) = ${wallet}
      and t.id <> 'znzf'
      and lower(tr.wallet) <> ${wallet}
      and tr.side = 'buy'
    limit 1
  `;
  let referrals = 0;
  try {
    const rows = await sql<{ n: number }>`
      select count(distinct lower(e.wallet))::int as n
      from referral_codes c
      join referral_events e on e.code = c.code and lower(e.wallet) <> lower(c.wallet)
      join trades tr on lower(tr.wallet) = lower(e.wallet) and tr.side = 'buy' and tr.token_id = 'znzf'
      join holdings h on lower(h.wallet) = lower(e.wallet) and h.token_id = 'znzf' and h.amount >= ${minTokens}
      where lower(c.wallet) = ${wallet}
    `;
    referrals = rows[0]?.n ?? 0;
  } catch {
    referrals = 0;
  }
  return {
    launched: Boolean(launched[0]),
    launchId: launched[0]?.id ?? "",
    bought: Boolean(bought[0]),
    seen: Boolean(seen[0]),
    referrals,
  };
}

function asWei(value: string | null | undefined) {
  if (!value) return 0n;
  const whole = value.split(".")[0]?.replace(/[^0-9-]/g, "") ?? "0";
  if (!whole || whole === "-") return 0n;
  try {
    return BigInt(whole);
  } catch {
    return 0n;
  }
}
function znzfText(wei: bigint) {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

async function loadDropRules(): Promise<DropRules> {
  const desk = await loadDeskConfig();
  const num = (key: string, fallback: number) => {
    const n = Number(desk[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  const base = publicRules(defaultDropRules());
  const spinText = (desk.drop_spin ?? "").trim();
  const legacy =
    num("drop_buy", 0) === 20_000 &&
    num("drop_telegram", 0) === 5_000 &&
    num("drop_x", 0) === 5_000 &&
    num("drop_launch", 0) === 8_000 &&
    num("drop_seen", 0) === 4_000 &&
    num("drop_referral", 0) === 5_000 &&
    (spinText === "" || spinText === "500:50,1000:30,2000:15,3000:5");
  const spin = spinText
    .split(",")
    .map((part) => {
      const [amount, weight] = part.split(":");
      return { points: Number(amount), weight: Number(weight) };
    })
    .filter((slice) => Number.isInteger(slice.points) && Number.isInteger(slice.weight));
  return (
    rulesFromDesk({
      buy: legacy ? base.buy : num("drop_buy", base.buy),
      telegram: legacy ? base.telegram : num("drop_telegram", base.telegram),
      x: legacy ? base.x : num("drop_x", base.x),
      launch: legacy ? base.launch : num("drop_launch", base.launch),
      seen: legacy ? base.seen : num("drop_seen", base.seen),
      referral: legacy ? base.referral : num("drop_referral", base.referral),
      referralMax: num("drop_referral_max", base.referralMax),
      minHold: num("drop_min_hold", base.minHold),
      spin: legacy || !spin.length ? base.spin : spin,
    }) ?? defaultDropRules()
  );
}

function claimWindow(desk: Record<string, string>, now = Date.now()) {
  const raw = desk.drop_claims_at?.trim() ?? "";
  const scheduled = raw ? Date.parse(raw) : Number.NaN;
  const at = Number.isFinite(scheduled) ? new Date(scheduled).toISOString() : "";
  const enabled = desk.drop_claims_open === "true";
  const waiting = Number.isFinite(scheduled) && now < scheduled;
  return { open: enabled && !waiting, enabled, at };
}

async function readClaimWindow() {
  return claimWindow(await loadDeskConfig());
}

function storedSpinPoints(raw: string | null | undefined) {
  if (raw == null || raw === "") return null;
  const n = asWei(raw);
  if (n >= UNIT) return Number(n / UNIT);
  if (n > 1_000_000n) return 1_000_000;
  return Number(n);
}

async function quote(wallet: string, row: WalletRow | undefined, rules: DropRules) {
  const did = await actions(wallet, Number(rules.minHold / UNIT));
  const spun = storedSpinPoints(row?.spin_wei);
  let held = 0n;
  try {
    const { readTokenBalance } = await import("@/lib/rpc.server");
    const { znzfAddress } = await import("@/lib/server/airdrop-chain.server");
    const token = znzfAddress();
    if (token) held = await readTokenBalance("robinhood", token, wallet);
  } catch {
    held = 0n;
  }
  const bought = did.bought || held > 0n;
  const points = pointTotal(
    {
      bought,
      telegram: Boolean(row?.telegram_ok),
      xFollow: Boolean(row?.x_follow_ok),
      launched: did.launched,
      seen: did.seen,
      referrals: did.referrals,
      spinPoints: spun ?? 0,
    },
    rules,
  );
  const eligible = bought && held >= rules.minHold && points > 0;
  return { ...did, bought, spun, points, held, eligible };
}

async function clearShares() {
  const sql = await db();
  await sql`delete from airdrop_shares`;
  await sql`
    insert into protocol_config (key, value) values ('drop_shares_lock', '')
    on conflict (key) do update set value = excluded.value
  `;
  invalidateDeskConfig();
}

async function shareOf(wallet: string) {
  const sql = await db();
  const rows = await sql<{ share_wei: string }>`
    select share_wei::text from airdrop_shares where wallet = ${wallet} limit 1
  `;
  return asWei(rows[0]?.share_wei);
}

/** Freeze one point-share of the on-chain balance. Closed, or unpaid, clears it. */
async function ensureShares() {
  const window = await readClaimWindow();
  if (!window.open) return;
  const sql = await db();
  const lock = await sql<{ value: string }>`
    select value from protocol_config where key = 'drop_shares_lock' limit 1
  `;
  if (lock[0]?.value === "1") return;
  const claimed = await sql`
    insert into protocol_config (key, value) values ('drop_shares_lock', 'building')
    on conflict (key) do update set value = 'building'
    where protocol_config.value is distinct from '1'
    returning key
  `;
  if (!claimed.length) return;
  const rules = await loadDropRules();
  const rows = await sql<WalletRow>`
    select wallet, x_handle, telegram_user_id, telegram_ok, x_follow_ok, spin_wei::text
    from airdrop_wallets
  `;
  const ready: { wallet: string; points: number }[] = [];
  for (const row of rows) {
    const q = await quote(row.wallet, row, rules);
    if (q.eligible) ready.push({ wallet: row.wallet, points: q.points });
  }
  const total = ready.reduce((sum, row) => sum + BigInt(row.points), 0n);
  const { dropInventory } = await import("@/lib/server/airdrop-chain.server");
  const pool = await dropInventory();
  await sql`delete from airdrop_shares`;
  for (const row of ready) {
    const share = shareWei(BigInt(row.points), total, pool.balance);
    await sql`
      insert into airdrop_shares (wallet, points, share_wei)
      values (${row.wallet}, ${row.points}, ${share.toString()})
    `;
  }
  await sql`
    insert into protocol_config (key, value) values ('drop_shares_lock', '1')
    on conflict (key) do update set value = '1'
  `;
  invalidateDeskConfig();
}

export async function recordTelegramStart(text: string, telegramUserId: string) {
  const match = text.match(/^\/start(?:@\w+)?\s+join_(0x[a-fA-F0-9]{40})\b/i);
  if (!match?.[1] || !/^\d+$/.test(telegramUserId)) return;
  const wallet = match[1].toLowerCase();
  const ok = await inRoom(telegramUserId);
  const sql = await db();
  await sql`
    update airdrop_wallets
    set telegram_ok = false, telegram_user_id = null
    where telegram_user_id = ${telegramUserId} and wallet <> ${wallet}
  `;
  await sql`
    insert into airdrop_wallets (wallet, telegram_user_id, telegram_ok)
    values (${wallet}, ${telegramUserId}, ${ok})
    on conflict (wallet) do update
      set telegram_user_id = excluded.telegram_user_id,
          telegram_ok = excluded.telegram_ok
  `;
}

async function roomLinks() {
  const bot = await botName();
  const room = await publicRoomUrl();
  const handle = ((await configValue("x_handle")) ?? "ZenzeFun").replace(/^@/, "");
  return { bot, room, group: COMMUNITY_GROUP_URL, xReady: true, handle };
}

export const airdropStatus = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    const links = await roomLinks();
    const rules = await loadDropRules();
    const shown = publicRules(rules);
    const { dropInventory } = await import("@/lib/server/airdrop-chain.server");
    const pool = await dropInventory();
    const funded = pool.balance + pool.claimed;
    const window = await readClaimWindow();
    const empty = {
      ok: true as const,
      bought: false,
      telegramOk: false,
      xFollow: false,
      xHandle: "",
      launched: false,
      launchId: "",
      seen: false,
      referrals: 0,
      spun: false,
      spinPoints: 0,
      points: 0,
      schedule: "0",
      held: "0",
      claim: "0",
      claimWei: "0",
      bot: links.bot ? `https://t.me/${links.bot}` : "",
      room: links.room,
      group: links.group,
      x: X,
      followUrl: `https://x.com/intent/follow?screen_name=${encodeURIComponent(links.handle)}`,
      xReady: links.xReady,
      claimsOpen: window.open && pool.deployed && !pool.paused,
      claimsAt: window.at,
      poolBalance: znzfText(pool.balance),
      poolClaimed: znzfText(pool.claimed),
      poolFunded: znzfText(funded),
      rules: shown,
      board: [] as { wallet: string; points: number; claim: string }[],
      totalPoints: 0,
      eligibleCount: 0,
      preview: "0",
      sharePct: 0,
      maxPoints: maxPoints(rules),
    };
    if (window.open && pool.deployed && !pool.paused) await ensureShares();
    const census = await leaderboard(rules, window.open);
    const split = {
      board: census.board,
      totalPoints: census.totalPoints,
      eligibleCount: census.eligible,
    };
    if (!isHexAddress(wallet)) return { ...empty, ...split };
    const sql = await db();
    await sql`insert into airdrop_wallets (wallet) values (${wallet}) on conflict (wallet) do nothing`;
    const rows = await sql<WalletRow>`
      select wallet, x_handle, telegram_user_id, telegram_ok, x_follow_ok, spin_wei::text
      from airdrop_wallets where wallet = ${wallet} limit 1
    `;
    const row = rows[0];
    let telegramOk = Boolean(row?.telegram_ok);
    if (row?.telegram_user_id) {
      telegramOk = await inRoom(row.telegram_user_id);
      if (telegramOk !== row.telegram_ok) {
        await sql`update airdrop_wallets set telegram_ok = ${telegramOk} where wallet = ${wallet}`;
      }
    }
    const live = { ...row, wallet, telegram_ok: telegramOk, x_follow_ok: Boolean(row?.x_follow_ok), x_handle: row?.x_handle ?? null, telegram_user_id: row?.telegram_user_id ?? null, spin_wei: row?.spin_wei ?? null };
    const q = await quote(wallet, live, rules);
    const start = links.bot ? `https://t.me/${links.bot}?start=join_${wallet}` : "";
    const share = window.open ? await shareOf(wallet) : 0n;
    const mine = q.eligible ? q.points : 0;
    const already = census.seen.includes(wallet);
    const countedTotal = q.eligible && !already ? census.totalPoints + mine : census.totalPoints;
    const preview = shareWei(BigInt(mine), BigInt(countedTotal), pool.balance);
    const sharePct = countedTotal > 0 && mine > 0 ? Math.round((mine / countedTotal) * 1000) / 10 : 0;
    return {
      ...empty,
      ...split,
      totalPoints: countedTotal,
      bought: q.bought,
      telegramOk,
      xFollow: Boolean(row?.x_follow_ok),
      xHandle: row?.x_handle ?? "",
      launched: q.launched,
      launchId: q.launchId,
      seen: q.seen,
      referrals: Math.min(shown.referralMax, q.referrals),
      spun: q.spun != null,
      spinPoints: q.spun ?? 0,
      points: q.points,
      schedule: "0",
      held: znzfText(q.held),
      claim: znzfText(share),
      claimWei: share.toString(),
      preview: znzfText(window.open ? share : preview),
      sharePct,
      bot: start,
      board: split.board,
    };
  });

async function leaderboard(rules: DropRules, open: boolean) {
  const now = Date.now();
  if (boardMemo && boardMemo.open === open && now - boardMemo.at < 15_000) return boardMemo.value;
  if (boardFlight) return boardFlight;
  boardFlight = (async () => {
    const sql = await db();
    const rows = await sql<WalletRow>`
      select wallet, x_handle, telegram_user_id, telegram_ok, x_follow_ok, spin_wei::text
      from airdrop_wallets
      order by created_at desc
      limit 200
    `;
    const ranked = (
      await Promise.all(
        rows.map(async (row) => {
          const q = await quote(row.wallet, row, rules);
          if (!q.eligible) return null;
          const share = open ? await shareOf(row.wallet) : 0n;
          return { wallet: row.wallet, points: q.points, claim: znzfText(share) };
        }),
      )
    ).filter((row): row is { wallet: string; points: number; claim: string } => row != null);
    ranked.sort((a, b) => b.points - a.points);
    const value = {
      totalPoints: ranked.reduce((sum, row) => sum + row.points, 0),
      eligible: ranked.length,
      seen: ranked.map((row) => row.wallet),
      board: ranked.slice(0, 20),
    };
    boardMemo = { at: Date.now(), open, value };
    return value;
  })().finally(() => {
    boardFlight = null;
  });
  return boardFlight;
}
let boardMemo: { at: number; open: boolean; value: { totalPoints: number; eligible: number; seen: string[]; board: { wallet: string; points: number; claim: string }[] } } | null = null;
let boardFlight: Promise<{ totalPoints: number; eligible: number; seen: string[]; board: { wallet: string; points: number; claim: string }[] }> | null = null;

async function xCodeFor(wallet: string) {
  const sql = await db();
  await sql`
    create table if not exists x_follow_codes (
      wallet text primary key,
      code text not null,
      created_at timestamptz not null default now()
    )
  `;
  const existing = await sql<{ code: string }>`select code from x_follow_codes where wallet = ${wallet} limit 1`;
  if (existing[0]?.code) return existing[0].code;
  const code = `ZENZE${randomBytes(4).toString("hex").toUpperCase()}`;
  await sql`insert into x_follow_codes (wallet, code) values (${wallet}, ${code})`;
  return code;
}

function statusId(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (!/^(?:x|twitter)\.com$/i.test(url.hostname.replace(/^www\./, ""))) return "";
    const match = url.pathname.match(/\/status\/(\d{6,25})/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

async function readPublicPost(id: string) {
  const syndicated = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=0`, {
    headers: { accept: "application/json", "user-agent": "Zenze.fun/1.0" },
  }).catch(() => null);
  if (syndicated?.ok) {
    const json = (await syndicated.json()) as { text?: string; user?: { screen_name?: string } };
    const text = json.text ?? "";
    const handle = json.user?.screen_name ?? "";
    if (text && handle) return { text, handle };
  }
  const embed = await fetch(`https://publish.x.com/oembed?omit_script=true&url=${encodeURIComponent(`https://x.com/i/web/status/${id}`)}`, {
    headers: { accept: "application/json", "user-agent": "Zenze.fun/1.0" },
  }).catch(() => null);
  if (!embed?.ok) return null;
  const json = (await embed.json()) as { html?: string; author_url?: string };
  const handle = json.author_url?.split("/").filter(Boolean).pop() ?? "";
  const text = (json.html ?? "").replace(/<[^>]+>/g, " ");
  if (!text || !handle) return null;
  return { text, handle };
}

export const beginAirdropX = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    const handle = ((await configValue("x_handle")) ?? "ZenzeFun").replace(/^@/, "");
    const code = await xCodeFor(wallet);
    const line = `Following @${handle} ${code}`;
    return {
      ok: true as const,
      code,
      followUrl: `https://x.com/intent/follow?screen_name=${encodeURIComponent(handle)}`,
      postUrl: `https://x.com/intent/tweet?text=${encodeURIComponent(line)}`,
    };
  });

export const confirmAirdropX = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string; url?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    const id = statusId(data.url ?? "");
    if (!id) return { ok: false as const, error: "Paste the link of the public post." };
    const code = await xCodeFor(wallet);
    const post = await readPublicPost(id);
    if (!post) return { ok: false as const, error: "That post could not be read. Leave it public and try the link again." };
    const handle = post.handle.replace(/^@/, "");
    if (!post.text.toUpperCase().includes(code) || !/zenzefun/i.test(post.text)) {
      return { ok: false as const, error: "The post has to include your line and @ZenzeFun." };
    }
    const sql = await db();
    const taken = await sql<{ wallet: string }>`
      select wallet from airdrop_wallets where lower(x_handle) = ${handle.toLowerCase()} and wallet <> ${wallet} limit 1
    `;
    if (taken[0]) return { ok: false as const, error: "That X account is already used by another wallet." };
    await sql`
      insert into airdrop_wallets (wallet, x_handle, x_follow_ok)
      values (${wallet}, ${handle}, true)
      on conflict (wallet) do update
        set x_handle = excluded.x_handle, x_follow_ok = true
    `;
    return { ok: true as const, handle };
  });

export const spinAirdrop = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    const sql = await db();
    const existing = await sql<{ spin_wei: string | null }>`
      select spin_wei::text from airdrop_wallets where wallet = ${wallet} limit 1
    `;
    if (existing[0]?.spin_wei != null) {
      const rules = await loadDropRules();
      const points = storedSpinPoints(existing[0].spin_wei) ?? 0;
      const known = rules.spin.findIndex((slice) => slice.points === points);
      return { ok: true as const, points, index: known >= 0 ? known : 0, already: true };
    }
    const rules = await loadDropRules();
    const did = await actions(wallet, Number(rules.minHold / UNIT));
    const secret = (await configValue("x_handle")) ?? "ZenzeFun";
    const roll = createHash("sha256").update(`${wallet}:${secret}:spin`).digest()[0] % 100;
    const slice = spinFromRoll(roll, rules.spin);
    try {
      await sql`
        insert into airdrop_wallets (wallet, spin_wei, spin_at)
        values (${wallet}, ${String(slice.points)}, now())
        on conflict (wallet) do update set spin_wei = excluded.spin_wei, spin_at = now()
        where airdrop_wallets.spin_wei is null
      `;
    } catch {
      return { ok: false as const, error: "The spin did not save. Try again in a moment." };
    }
    return { ok: true as const, points: slice.points, index: slice.index, already: false };
  });

export const prepareAirdropClaim = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = (data.wallet ?? "").toLowerCase();
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    const window = await readClaimWindow();
    if (!window.open) return { ok: false as const, error: "This is not open yet." };
    await ensureShares();
    const sql = await db();
    const rows = await sql<WalletRow>`
      select wallet, x_handle, telegram_user_id, telegram_ok, x_follow_ok, spin_wei::text
      from airdrop_wallets where wallet = ${wallet} limit 1
    `;
    const rules = await loadDropRules();
    const shown = publicRules(rules);
    const q = await quote(wallet, rows[0], rules);
    if (!q.bought) return { ok: false as const, error: "Buy $ZNZF to join." };
    if (q.held < rules.minHold) {
      return { ok: false as const, error: `Hold at least ${shown.minHold.toLocaleString("en-US")} $ZNZF.` };
    }
    const share = await shareOf(wallet);
    if (share <= 0n) return { ok: false as const, error: "No share is assigned to this wallet." };
    const { claimedOf, dropInventory, signDropClaim } = await import("@/lib/server/airdrop-chain.server");
    const pool = await dropInventory();
    if (!pool.deployed || !pool.drop || pool.paused) return { ok: false as const, error: "This is not open yet." };
    const already = await claimedOf(wallet as `0x${string}`);
    const unpaid = share > already ? share - already : 0n;
    if (unpaid === 0n) return { ok: false as const, error: "You already took this share." };
    if (unpaid > pool.balance) return { ok: false as const, error: "There isn't enough left for this share." };
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30);
    const signed = await signDropClaim(wallet as `0x${string}`, share, deadline);
    if (!signed.ok) return signed;
    return { ...signed, chainId: 4663 };
  });

export const airdropDesk = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const { dropInventory, dropSigner } = await import("@/lib/server/airdrop-chain.server");
    const pool = await dropInventory().catch(() => ({
      deployed: false,
      balance: 0n,
      claimed: 0n,
      paused: false,
      owner: "",
      drop: "",
      token: "",
    }));
    const rules = await loadDropRules();
    const shown = publicRules(rules);
    const window = await readClaimWindow();
    if (window.open) {
      try {
        await ensureShares();
      } catch {}
    }
    const sql = await db();
    const rows = await sql<WalletRow>`
      select wallet, x_handle, telegram_user_id, telegram_ok, x_follow_ok, spin_wei::text
      from airdrop_wallets
      order by created_at desc
      limit 80
    `;
    const wallets = (
      await Promise.all(
        rows.map(async (row) => {
          try {
            const q = await quote(row.wallet, row, rules);
            if (q.points <= 0 && !q.bought) return null;
            const share = window.open ? await shareOf(row.wallet) : 0n;
            return {
              wallet: row.wallet,
              bought: q.bought,
              ready: q.eligible,
              x: Boolean(row.x_follow_ok),
              telegram: Boolean(row.telegram_ok),
              launched: q.launched,
              referrals: q.referrals,
              points: q.points,
              claim: znzfText(share),
              held: znzfText(q.held),
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter((row): row is NonNullable<typeof row> => row != null);
    wallets.sort((a, b) => b.points - a.points || Number(b.ready) - Number(a.ready));
    return {
      ok: true as const,
      pool: pool.deployed ? pool.drop ?? "" : "",
      balance: znzfText(pool.balance),
      claimed: znzfText(pool.claimed),
      funded: znzfText(pool.balance + pool.claimed),
      rules: shown,
      claimsOpen: window.open,
      claimsEnabled: window.enabled,
      claimsAt: window.at,
      paused: pool.paused,
      owner: pool.owner,
      signer: (() => {
        try {
          return Boolean(dropSigner());
        } catch {
          return false;
        }
      })(),
      xReady: true,
      xRedirect: "",
      token: publishedConfig().znzf_robinhood ?? "",
      wallets,
    };
  });

export const saveClaimWindow = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { open: boolean; opensAt: string }) => input)
  .handler(async ({ data, context }) => {
    const { roleOfWallet } = await import("@/lib/server/operator");
    if ((await roleOfWallet(context.operatorWallet)) !== "super_admin") {
      return { ok: false as const, error: "Super admin only." };
    }
    const raw = data.opensAt.trim();
    const scheduled = raw ? Date.parse(raw) : Number.NaN;
    if (raw && !Number.isFinite(scheduled)) return { ok: false as const, error: "That date is not valid." };
    const at = raw ? new Date(scheduled).toISOString() : "";
    const open = data.open ? "true" : "false";
    const sql = await getSql();
    for (const [key, value] of [
      ["drop_claims_open", open],
      ["drop_claims_at", at],
    ] as const) {
      await sql`
        insert into protocol_config (key, value) values (${key}, ${value})
        on conflict (key) do update set value = excluded.value
      `;
    }
    invalidateDeskConfig();
    await sql`
      insert into audit_logs (user_id, action, detail)
      values (${context.operatorWallet}, 'drop_window', ${`${open} ${at}`})
    `;
    const live = data.open && !(at && Date.now() < scheduled);
    const { dropInventory } = await import("@/lib/server/airdrop-chain.server");
    const pool = await dropInventory();
    if (!live && pool.claimed === 0n) await clearShares();
    if (live) await ensureShares();
    return { ok: true as const, open: live, at };
  });

export const saveDropRules = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator(
    (input: {
      buy: number;
      telegram: number;
      x: number;
      launch: number;
      seen: number;
      referral: number;
      referralMax: number;
      minHold: number;
      spin: { points: number; weight: number }[];
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { roleOfWallet } = await import("@/lib/server/operator");
    if ((await roleOfWallet(context.operatorWallet)) !== "super_admin") {
      return { ok: false as const, error: "Super admin only." };
    }
    const rules = rulesFromDesk(data);
    if (!rules) return { ok: false as const, error: "Check the points. Spin chances have to add up to 100." };
    const shown = publicRules(rules);
    const sql = await getSql();
    const spin = rules.spin.map((slice) => `${slice.points}:${slice.weight}`).join(",");
    const rows = [
      ["drop_buy", String(shown.buy)],
      ["drop_telegram", String(shown.telegram)],
      ["drop_x", String(shown.x)],
      ["drop_launch", String(shown.launch)],
      ["drop_seen", String(shown.seen)],
      ["drop_referral", String(shown.referral)],
      ["drop_referral_max", String(shown.referralMax)],
      ["drop_min_hold", String(shown.minHold)],
      ["drop_spin", spin],
    ] as const;
    for (const [key, value] of rows) {
      await sql`
        insert into protocol_config (key, value) values (${key}, ${value})
        on conflict (key) do update set value = excluded.value
      `;
    }
    invalidateDeskConfig();
    const window = await readClaimWindow();
    const { dropInventory } = await import("@/lib/server/airdrop-chain.server");
    const pool = await dropInventory();
    if (window.open && pool.claimed === 0n) {
      await clearShares();
      await ensureShares();
    }
    await sql`
      insert into audit_logs (user_id, action, detail)
      values (${context.operatorWallet}, 'drop_rules', ${rows.map((row) => row.join("=")).join(" ")})
    `;
    return { ok: true as const };
  });
