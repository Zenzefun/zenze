import { getSql } from "@/lib/db";
import { asNumber } from "@/lib/format";
import { searchTweets } from "@/lib/server/twitterapis";
import { isMillDump } from "./shape";

export type MemoryPack = {
  strategy: string;
  bottleneck: string;
  lastNote: string;
  winningHooks: string[];
  deadHooks: string[];
  freezeUntil: number;
  hotHandles: string[];
};

const EMPTY: MemoryPack = {
  strategy: "",
  bottleneck: "No operator memory yet. Ship one true original, then learn.",
  lastNote: "",
  winningHooks: [],
  deadHooks: [],
  freezeUntil: 0,
  hotHandles: [],
};

async function readKey(sql: Awaited<ReturnType<typeof getSql>>, key: string): Promise<unknown> {
  try {
    const rows = await sql<{ value: unknown }>`select value from marketing_memory where key = ${key} limit 1`;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function writeKey(key: string, value: unknown) {
  try {
    const sql = await getSql();
    const json = JSON.stringify(value);
    await sql`
      insert into marketing_memory (key, value, updated_at)
      values (${key}, ${json}::jsonb, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `;
  } catch {
    // table may not exist yet
  }
}

export async function loadMemoryPack(): Promise<MemoryPack> {
  try {
    const sql = await getSql();
    const [strategy, bottleneck, note, hooks, freeze, contacts] = await Promise.all([
      readKey(sql, "strategy"),
      readKey(sql, "bottleneck"),
      readKey(sql, "last_note"),
      readKey(sql, "hooks"),
      readKey(sql, "graph_freeze"),
      sql<{ handle: string }>`
        select handle from marketing_contacts
         where temperature = 'hot' and do_not_contact = false
         order by updated_at desc limit 8
      `.catch(() => [] as { handle: string }[]),
    ]);
    const hookObj = (hooks && typeof hooks === "object" ? hooks : {}) as { winning?: string[]; dead?: string[] };
    const freezeObj = (freeze && typeof freeze === "object" ? freeze : {}) as { until?: number };
    const str = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "text" in v ? String((v as { text: unknown }).text) : "");
    return {
      strategy: str(strategy) || EMPTY.strategy,
      bottleneck: str(bottleneck) || EMPTY.bottleneck,
      lastNote: str(note) || EMPTY.lastNote,
      winningHooks: Array.isArray(hookObj.winning) ? hookObj.winning.slice(0, 8) : [],
      deadHooks: Array.isArray(hookObj.dead) ? hookObj.dead.slice(0, 8) : [],
      freezeUntil: Number(freezeObj.until) || 0,
      hotHandles: contacts.map((c) => c.handle),
    };
  } catch {
    return EMPTY;
  }
}

export async function persistPlan(input: { strategy: string; bottleneck: string; note: string }) {
  await writeKey("strategy", { text: input.strategy.slice(0, 800) });
  await writeKey("bottleneck", { text: input.bottleneck.slice(0, 400) });
  await writeKey("last_note", { text: input.note.slice(0, 1200) });
  try {
    const sql = await getSql();
    await sql`
      insert into marketing_notes (strategy, bottleneck, note)
      values (${input.strategy.slice(0, 800)}, ${input.bottleneck.slice(0, 400)}, ${input.note.slice(0, 1200)})
    `;
    await sql`delete from marketing_notes where id not in (select id from marketing_notes order by created_at desc limit 40)`;
  } catch {
    // ignore
  }
}

export async function freezeGraph(hours = 24) {
  await writeKey("graph_freeze", { until: Date.now() + hours * 3600_000, reason: "platform pressure" });
}

export async function touchContact(input: {
  handle: string;
  segment?: string;
  action: string;
  topic?: string;
  temperature?: "cold" | "warm" | "hot";
  objections?: string;
}) {
  const handle = input.handle.replace(/^@/, "").toLowerCase();
  if (!handle) return;
  try {
    const sql = await getSql();
    await sql`
      insert into marketing_contacts (handle, segment, last_action, last_topic, temperature, objections, updated_at)
      values (
        ${handle},
        ${input.segment ?? ""},
        ${input.action},
        ${(input.topic ?? "").slice(0, 240)},
        ${input.temperature ?? "cold"},
        ${(input.objections ?? "").slice(0, 240)}
      )
      on conflict (handle) do update set
        segment = coalesce(nullif(excluded.segment, ''), marketing_contacts.segment),
        last_action = excluded.last_action,
        last_topic = excluded.last_topic,
        temperature = excluded.temperature,
        objections = coalesce(nullif(excluded.objections, ''), marketing_contacts.objections),
        updated_at = now()
    `;
  } catch {
    // ignore
  }
}

const learnedAt = { t: 0 };

export async function learnFromOwnPosts(handle: string) {
  if (Date.now() - learnedAt.t < 30 * 60 * 1000) return;
  learnedAt.t = Date.now();
  const mine = await searchTweets(`from:${handle}`);
  if (!mine.length) return;
  const sql = await getSql();
  const scored: { play: string; score: number; hook: string }[] = [];
  for (const p of mine) {
    const score = p.likes + p.replies * 3 + p.retweets * 2 + p.quotes * 4 + p.views / 200;
    try {
      await sql`
        update marketing_posts
           set likes = ${p.likes},
               replies = ${p.replies},
               quotes = ${p.quotes},
               views = ${p.views},
               score = ${score}
         where x_post_id = ${p.id}
      `;
    } catch {
      // columns may not exist yet
    }
    scored.push({ play: "own", score, hook: p.text.slice(0, 120) });
  }
  try {
    await sql`
      insert into marketing_learnings (play, posts, score_sum, last_score, hook, updated_at)
      select play, count(*), coalesce(sum(score),0), coalesce(max(score),0),
             left(max(content), 120), now()
        from marketing_posts
       where status = 'posted' and play is not null and play <> ''
       group by play
      on conflict (play) do update set
        posts = excluded.posts,
        score_sum = excluded.score_sum,
        last_score = excluded.last_score,
        hook = excluded.hook,
        updated_at = now()
    `;
  } catch {
    // table may not exist yet
  }

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const mill = ranked.filter((r) => isMillDump(r.hook)).map((r) => r.hook);
  const winning = ranked.filter((r) => r.score >= 8 && !isMillDump(r.hook)).slice(0, 6).map((r) => r.hook);
  const dead = [
    ...mill,
    ...ranked.filter((r) => r.score < 2 && !isMillDump(r.hook)).slice(-6).map((r) => r.hook),
  ].slice(0, 8);
  if (winning.length || dead.length) {
    await writeKey("hooks", { winning, dead });
  }
}

export async function latestNote() {
  try {
    const sql = await getSql();
    const rows = await sql<{ strategy: string; bottleneck: string; note: string; created_at: string }>`
      select strategy, bottleneck, note, created_at from marketing_notes order by created_at desc limit 1
    `;
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function listQueue(limit = 20) {
  try {
    const sql = await getSql();
    return await sql<{
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
      status: string;
      created_at: string;
    }>`
      select id, action, job, risk, segment, audience, reason, draft, handle, post_id, url, status, created_at
        from marketing_queue
       where status = 'pending'
       order by created_at desc
       limit ${limit}
    `;
  } catch {
    return [];
  }
}

export async function playLearnings() {
  try {
    const sql = await getSql();
    const rows = await sql<{ play: string; posts: number; score_sum: string | number; hook: string }>`
      select play, posts, score_sum, hook from marketing_learnings order by score_sum desc
    `;
    return rows.map((r) => ({
      play: r.play,
      posts: r.posts,
      avg: r.posts ? asNumber(r.score_sum) / r.posts : 0,
      hook: r.hook,
    }));
  } catch {
    return [];
  }
}
