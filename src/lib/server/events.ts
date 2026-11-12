import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

type EventName = "pageview" | "launch_form_start" | "launch_form_complete";

const ALLOWED = new Set<EventName>(["pageview", "launch_form_start", "launch_form_complete"]);

function clean(s: unknown, max = 64): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  if (!t || /[^\w.-]/.test(t)) return null;
  return t;
}

function cleanPath(s: unknown, max = 200): string {
  if (typeof s !== "string") return "/";
  const t = s.trim().slice(0, max);
  // Allow URL paths such as /launch and /docs/creator. Reject query/hash/spaces.
  if (!t || !/^\/[A-Za-z0-9/._-]*$/.test(t)) return "/";
  return t;
}

export const recordEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("bad");
    const d = input as Record<string, unknown>;
    const name = String(d.name ?? "");
    if (!ALLOWED.has(name as EventName)) throw new Error("bad name");
    const path = cleanPath(d.path);
    return {
      name: name as EventName,
      path,
      sessionId: clean(d.sessionId, 64) ?? "anon",
      referrerHost: clean(d.referrerHost, 128),
      utm_source: clean(d.source),
      utm_medium: clean(d.medium),
      utm_campaign: clean(d.campaign),
      utm_content: clean(d.content),
      utm_term: clean(d.term),
    };
  })
  .handler(async ({ data }) => {
    try {
      const sql = await getSql();
      // Crude rate limit: ignore if this session already has > 30 events in the last minute.
      const recent = await sql<{ n: number }>`
        select count(*)::int as n from site_events
        where session_id = ${data.sessionId}
          and occurred_at > now() - interval '1 minute'
      `;
      if (Number(recent[0]?.n ?? 0) > 30) return { ok: true };
      await sql`
        insert into site_events (
          name, path, session_id, referrer_host,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term
        ) values (
          ${data.name}, ${data.path}, ${data.sessionId}, ${data.referrerHost},
          ${data.utm_source}, ${data.utm_medium}, ${data.utm_campaign}, ${data.utm_content}, ${data.utm_term}
        )
      `;
    } catch {
      /* best-effort: never break the request */
    }
    return { ok: true };
  });

import { requireOperator } from "@/lib/server/operator";

export const siteFunnel = createServerFn({ method: "GET" })
  .handler(async () => {
    await requireOperator();
    const sql = await getSql();
    const counts = await sql<{ name: string; n: number }>`
      select name, count(*)::int as n
      from site_events
      where occurred_at > now() - interval '7 days'
      group by name
    `;
    const campaigns = await sql<{ utm_campaign: string; n: number }>`
      select utm_campaign, count(*)::int as n
      from site_events
      where occurred_at > now() - interval '7 days' and utm_campaign is not null
      group by utm_campaign
      order by n desc
      limit 10
    `;
    const withUtm = await sql<{ n: number }>`
      select count(*)::int as n
      from tokens
      where created_at > now() - interval '7 days' and utm_campaign is not null
    `;
    return {
      ok: true as const,
      counts: Object.fromEntries(counts.map((r) => [r.name, Number(r.n)])) as Record<string, number>,
      campaigns: campaigns.map((r) => ({ campaign: String(r.utm_campaign), n: Number(r.n) })),
      launchesWithUtm: Number(withUtm[0]?.n ?? 0),
    };
  });
