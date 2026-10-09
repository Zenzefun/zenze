import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { capyRead } from "@/lib/capy-read";
import { isZnzfRef } from "@/lib/token-path";
import { asNumber } from "@/lib/format";
import { displayTokenArt, publicTokenArt } from "@/lib/image-art";
import { operatorMiddleware } from "@/lib/operator-middleware";
import { configValue } from "@/lib/server/secrets";
import { publishTweet, xHandle, xIntentUrl, xPublishReady } from "@/lib/server/x";
import type { TokenRow } from "@/lib/types";
import { enrichToken, findTokenRow } from "./market";
import { chat, DEEPSEEK_MODEL, fetchEthUsd, remember, researchDesk } from "./ai-core.server";
import { isMillDump, shapePost } from "./maya/shape";

export const reviewTokenArt = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<TokenRow>`select * from tokens where id = ${data.id}`;
    const token = rows[0];
    if (!token) return { ok: false as const, error: "No token in this pool." };
    const art = publicTokenArt(token.image_url ?? "", token.id === "znzf");
    if (!art) return { ok: false as const, error: "This pool has no public art for Capy to look at." };
    const imageUrl = displayTokenArt(art);
    const result = await chat(
      [
        {
          type: "text",
          text: `Look at this launch art for $${token.symbol} (${token.name}) on ${token.chain}.
Describe only what you see (colors, subject, any text). Then one calm line on whether the canvas fits a fair-launch pool.
Never invent holders, volume, or price. Mention $ZNZF once as the protocol token. Under 120 words.`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
      280,
      "You are looking at an image. Describe what is actually in the frame.",
      "vision",
    );
    if (!result.ok) return result;
    return { ok: true as const, text: result.text, provider: result.provider };
  });

export const analyzeToken = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const token = await findTokenRow(sql, data.id);
    if (!token) return { ok: false as const, error: "No token in this pool." };
    const ethUsd = await fetchEthUsd();
    const e = enrichToken(token, { ethUsd });
    const native = asNumber(token.volume_24h);
    const volumeUsd = e.dex
      ? e.dex.volumeUsd
      : e.ethUsd != null && e.quote.key === "eth"
        ? native * e.ethUsd
        : e.quote.kind === "stable"
          ? native
          : null;
    const read = capyRead({
      name: token.name,
      quote: e.quote.symbol,
      priceUsd: e.priceUsd,
      priceQuote: e.price > 0 ? e.priceQuote : null,
      mcapUsd: e.priceUsd != null && e.mcap > 0 ? e.mcap : null,
      poolUsd: e.liquidityUsd,
      volumeUsd,
      holders: Math.max(0, Math.round(asNumber(token.holders))),
      onUniswap: Boolean(e.dex) || (Boolean(token.graduated) && !isZnzfRef(token.id) && !isZnzfRef(token.contract_address)),
    });
    const summary = [
      ...read.lines.map((line) => (line.hint ? `${line.label}: ${line.value} (${line.hint})` : `${line.label}: ${line.value}`)),
      "",
      read.note,
    ].join("\n");
    await sql`
      insert into ai_analyses (token_id, summary, health_label, rug_probability, whale_note)
      values (${token.id}, ${read.note}, ${""}, 0, ${""})
      on conflict (token_id) do update set
        summary = excluded.summary,
        health_label = excluded.health_label,
        rug_probability = excluded.rug_probability,
        whale_note = excluded.whale_note,
        created_at = now()
    `;
    return { ok: true as const, cached: false, summary, lines: read.lines, note: read.note };
  });

export const adviseTrade = createServerFn({ method: "POST" })
  .validator((input: { question: string; tokenId?: string }) => input)
  .handler(async ({ data }) => {
    const q = data.question.trim().slice(0, 500);
    if (!q) return { ok: false as const, error: "Ask something about the pool." };
    if (!data.tokenId) return { ok: true as const, text: "Pick a pool first. Then the numbers are here." };
    const sql = await getSql();
    const rows = await sql<TokenRow>`select * from tokens where id = ${data.tokenId}`;
    const token = rows[0];
    if (!token) return { ok: false as const, error: "No token in this pool." };
    const ethUsd = await fetchEthUsd();
    const e = enrichToken(token, { ethUsd });
    const native = asNumber(token.volume_24h);
    const volumeUsd = e.dex
      ? e.dex.volumeUsd
      : e.ethUsd != null && e.quote.key === "eth"
        ? native * e.ethUsd
        : e.quote.kind === "stable"
          ? native
          : null;
    const read = capyRead({
      name: token.name,
      quote: e.quote.symbol,
      priceUsd: e.priceUsd,
      priceQuote: e.price > 0 ? e.priceQuote : null,
      mcapUsd: e.priceUsd != null && e.mcap > 0 ? e.mcap : null,
      poolUsd: e.liquidityUsd,
      volumeUsd,
      holders: Math.max(0, Math.round(asNumber(token.holders))),
      onUniswap: Boolean(e.dex) || (Boolean(token.graduated) && !isZnzfRef(token.id) && !isZnzfRef(token.contract_address)),
    });
    const ask = q.toLowerCase();
    const extra = ask.includes("sell")
      ? "A sell is paid from what is in the pool."
      : ask.includes("buy") || ask.includes("enter")
        ? "A buy pays the price in the pool. Look at how much is in the pool before you decide how much to buy."
        : ask.includes("wait")
          ? "Nothing here says to wait or to jump. The numbers are the whole story."
          : "That is the whole read. It is not a buy or a sell.";
    return { ok: true as const, text: `${read.note} ${extra}` };
  });

export const runMarketingJob = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { request: string; publish: boolean }) => input)
  .handler(async ({ data, context }) => {
    const request = data.request.trim().slice(0, 1200);
    if (request.length < 4) return { ok: false as const, error: "Tell Capy what to write — a tweet, a thread, a vibe." };

    const sql = await getSql();
    const last = await sql<{ created_at: string }>`
      select created_at from marketing_posts
      where status = 'posted'
      order by created_at desc limit 1
    `;
    if (data.publish && last[0]) {
      const age = Date.now() - new Date(last[0].created_at).getTime();
      if (age < 15 * 60 * 1000) {
        return { ok: false as const, error: "The water is still. Wait 15 minutes between live posts." };
      }
    }

    const handle = await xHandle();
    const facts = await researchDesk();
    const research = [
      `X account: @${handle}`,
      `Pools: ${facts.launched}`,
      `ETH/USD: ${facts.ethUsd ?? "unquoted"}`,
      `24h quote volume: ${facts.volumeNative}`,
      facts.tokens.length ? `Recent: ${facts.tokens.join(" | ")}` : "No community launches yet.",
      facts.lastPosts.length ? `Last posts: ${facts.lastPosts.join(" / ")}` : "No prior posts.",
    ].join("\n");

    const prompt = `Operator request for @${handle}:
"""${request}"""

Research (facts only — never invent beyond this):
${research}

Task:
1. Write what the operator asked for, as a person at @ZenzeFun. Do not turn it into a four-line slogan unless they asked for that shape.
2. Use only the research figures. If a figure is zero or missing, say the pool is quiet.
3. Return ONLY the post text ready to publish. No preamble, no quotes around it.
4. Stay under 270 characters unless they asked for a thread.
5. Mention $ZNZF at least once.`;

    const drafted = await chat(prompt, 360, "You write as @ZenzeFun. A person should hear a person, not a slogan.", "marketing");
    if (!drafted.ok) return drafted;

    const text = shapePost(drafted.text.trim());
    if (isMillDump(text)) {
      return { ok: false as const, error: "That draft was a mill dump. Ask with a hook, one mechanic, one complete URL." };
    }
    let status: "queued" | "posted" | "failed" = "queued";
    let xPostId: string | null = null;
    let publishNote: string | null = null;
    let intent = xIntentUrl(text);
    const model = drafted.provider === "deepseek" ? DEEPSEEK_MODEL : "grok-4.5";

    if (data.publish) {
      const posted = await publishTweet(text);
      if (posted.ok) {
        status = "posted";
        xPostId = posted.id;
        publishNote = `Published to @${handle}`;
        await remember("style", `Operator asked: ${request.slice(0, 180)}. Posted: ${text.slice(0, 180)}`);
      } else {
        status = (await xPublishReady()) ? "failed" : "queued";
        intent = posted.intent;
        publishNote = posted.error;
      }
    } else {
      await remember("style", `Operator asked: ${request.slice(0, 180)}. Draft: ${text.slice(0, 180)}`);
    }

    const inserted = await sql<{ id: number }>`
      insert into marketing_posts (kind, content, status, request, research, x_post_id, published_at, provider, model)
      values (
        'request',
        ${text},
        ${status},
        ${request},
        ${research},
        ${xPostId},
        ${status === "posted" ? new Date().toISOString() : null},
        ${drafted.provider},
        ${model}
      )
      returning id
    `;
    await sql`
      insert into audit_logs (user_id, action, detail)
      values (${context.operatorWallet}, 'marketing_job', ${`${inserted[0]?.id}:${status}`})
    `;

    return {
      ok: true as const,
      id: inserted[0]?.id ?? 0,
      text,
      status,
      research,
      xPostId,
      intent,
      publishNote,
      provider: drafted.provider,
      model,
      canAutoPost: await xPublishReady(),
    };
  });

export const rewritePost = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .validator((input: { id: number; note?: string }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number; content: string; request: string | null; status: string }>`
      select id, content, request, status from marketing_posts where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "That draft drifted away." };
    if (row.status === "posted") return { ok: false as const, error: "That one is already live. Write a new request." };
    const note = (data.note ?? "Rewrite calmer, still $ZNZF, still under 270 characters.").slice(0, 400);
    const result = await chat(
      `Rewrite this @${await xHandle()} post.\nOriginal: ${row.content}\nOperator note: ${note}\nReturn only the new post.`,
      280,
      "",
      "rewrite",
    );
    if (!result.ok) return result;
    const model = result.provider === "deepseek" ? DEEPSEEK_MODEL : "grok-4.5";
    await sql`
      update marketing_posts
         set content = ${result.text.trim()}, provider = ${result.provider}, model = ${model}
       where id = ${data.id}
    `;
    await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'marketing_rewrite', ${String(data.id)})`;
    return { ok: true as const, text: result.text.trim(), provider: result.provider };
  });

export const aiDesk = createServerFn({ method: "GET" })
  .middleware([operatorMiddleware])
  .handler(async () => {
    const sql = await getSql();
    const deepseek = Boolean(await configValue("deepseek_api_key"));
    const xai = Boolean(await configValue("xai_api_key"));
    let jobs: {
      id: number;
      provider: string;
      model: string;
      kind: string;
      status: string;
      detail: string;
      created_at: string;
    }[] = [];
    let memory: { id: number; kind: string; content: string; created_at: string }[] = [];
    try {
      jobs = await sql`
        select id, provider, model, kind, status, detail, created_at
        from ai_jobs order by created_at desc limit 40
      `;
    } catch {
      jobs = [];
    }
    try {
      memory = await sql`select id, kind, content, created_at from ai_memory order by created_at desc limit 24`;
    } catch {
      memory = [];
    }
    return {
      provider: deepseek ? "DeepSeek" : xai ? "xAI Grok" : "Offline",
      model: deepseek ? DEEPSEEK_MODEL : xai ? "grok-4.5" : "",
      fallback: deepseek && xai ? "xAI Grok" : null,
      deepseek,
      xai,
      jobs,
      memory,
    };
  });

export const runAiPulse = createServerFn({ method: "POST" })
  .middleware([operatorMiddleware])
  .handler(async ({ context }) => {
    const facts = await researchDesk();
    const brief = [
      `Pools launched: ${facts.launched}`,
      `ETH/USD: ${facts.ethUsd ?? "unquoted"}`,
      `24h volume: ${facts.volumeNative}`,
      `Curve swap fee: ${facts.curveFeePct}%`,
      `ETH graduation: ${facts.graduationEth} ETH then Uniswap v4`,
      facts.tokens.length ? `Recent: ${facts.tokens.join(" | ")}` : "No community launches yet.",
      facts.lastPosts.length ? `Last posts: ${facts.lastPosts.join(" / ")}` : "No marketing posts yet.",
    ].join("\n");
    const result = await chat(
      `Operator pulse. Summarize the desk in under 120 words using only these figures. If a figure is zero, say the pool is quiet. Do not invent activity.\n${brief}`,
      220,
      "",
      "pulse",
    );
    if (result.ok) {
      const sql = await getSql();
      await sql`insert into audit_logs (user_id, action, detail) values (${context.operatorWallet}, 'ai_pulse', ${result.provider})`;
    }
    return result;
  });

export const draftProposal = createServerFn({ method: "POST" })
  .validator((input: { hint?: string }) => input)
  .handler(async ({ data }) => {
    const hint = (data.hint ?? "").trim().slice(0, 400);
    const facts = await researchDesk();
    const sql = await getSql();
    const staked = await sql<{ v: string | number }>`select coalesce(sum(amount), 0) as v from wallet_stakes`;
    const week = await sql<{ v: string | number }>`
      select coalesce(sum(amount), 0) as v from znzf_events
      where kind in ('fee_eth', 'listing_fee') and created_at > now() - interval '7 days'
    `;
    const open = await sql<{ n: number }>`select count(*)::int as n from proposals where status = 'open'`;
    const brief = [
      `Launched / listed pools: ${facts.launched}`,
      `ETH/USD: ${facts.ethUsd ?? "unquoted"}`,
      `24h volume (native): ${facts.volumeNative}`,
      `Total staked $ZNZF (ledger): ${staked[0]?.v ?? 0}`,
      `Protocol fees last 7 days (native): ${week[0]?.v ?? 0}`,
      `Open proposals: ${open[0]?.n ?? 0}`,
      facts.tokens.length ? `Recent pools: ${facts.tokens.join(" | ")}` : "No community launches yet.",
      hint ? `User hint: ${hint}` : "User asked Capy to draft from live facts only.",
    ].join("\n");
    const result = await chat(
      `Draft ONE governance proposal for Zenzen holders using ONLY these facts. Never invent volume, fees, or prices.
Facts:
${brief}

Return exactly:
TITLE: <max 90 chars, specific>
BODY: <120-180 words. What should change, why the facts support it, and a measurable check. If fees/volume are zero, propose a conservative parameter hold — do not invent traction.>`,
      420,
      "You draft protocol proposals. Never hype. Never invent numbers.",
      "proposal",
    );
    if (!result.ok) return result;
    const text = result.text.trim();
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i);
    const title = (titleMatch?.[1] ?? "Hold protocol parameters").replace(/^["']|["']$/g, "").trim().slice(0, 120);
    const body = (bodyMatch?.[1] ?? text).trim().slice(0, 4000);
    return { ok: true as const, title, body, provider: result.provider };
  });
