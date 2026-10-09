import { getSql } from "@/lib/db";
import { configValue } from "@/lib/server/secrets";
import { xPublishReady } from "@/lib/server/x";
import { loadCaps, countsToday } from "@/lib/server/x-engage";
import { runAutonomousPulse as runMayaPulse, type PulsePlay, type PulseResult } from "@/lib/server/maya/loop";
import { latestNote, listQueue, loadMemoryPack, playLearnings } from "@/lib/server/maya/learn";
import { ownDomainOn, siteDoor } from "@/lib/server/x-door";
import { originalsToday, minutesSinceLastOriginal, originalCapFrom } from "@/lib/server/maya/observe";

export type { PulsePlay, PulseResult };

function clampMinutes(raw: string | undefined) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 45;
  return Math.min(180, Math.max(20, Math.round(n)));
}

async function autoOn() {
  const v = (await configValue("x_auto_on")) ?? "true";
  return v === "true" || v === "1" || v === "on";
}

export async function runAutonomousPulse(reason: "cron" | "desk" | "boot" = "cron"): Promise<PulseResult> {
  return runMayaPulse(reason);
}

export async function autonomousStatus() {
  const sql = await getSql();
  const on = await autoOn();
  const minutes = clampMinutes(await configValue("x_auto_minutes"));
  const ready = await xPublishReady();
  const today = await originalsToday(sql);
  const since = await minutesSinceLastOriginal(sql);
  const [caps, engageToday, learnings, memory, note, pending] = await Promise.all([
    loadCaps(),
    countsToday(),
    playLearnings(),
    loadMemoryPack(),
    latestNote(),
    listQueue(12),
  ]);
  const last = await sql<{ content: string; play: string | null; status: string; created_at: string }>`
    select content, play, status, created_at from marketing_posts where kind = 'auto' order by created_at desc limit 1
  `;
  return {
    on,
    minutes,
    ready,
    today,
    originalCap: originalCapFrom(await configValue("x_daily_originals")),
    sinceMin: Math.round(since),
    nextIn: on ? Math.max(0, Math.ceil(minutes - since)) : null,
    learnings,
    last: last[0] ?? null,
    strategy: memory.strategy,
    bottleneck: note?.bottleneck || memory.bottleneck,
    note: note?.note || memory.lastNote,
    winningHooks: memory.winningHooks,
    deadHooks: memory.deadHooks,
    pending,
    autoReplies: ((await configValue("x_auto_replies_on_our_posts")) ?? "true") !== "false",
    autoFollows: ((await configValue("x_auto_follows")) ?? "true") !== "false",
    autoQuotes: ((await configValue("x_auto_quotes")) ?? "true") !== "false",
    ownDomain: await ownDomainOn(),
    door: await siteDoor(),
    quotas: {
      like: { done: engageToday.like, cap: caps.like },
      follow: { done: engageToday.follow, cap: caps.follow },
      repost: { done: engageToday.repost, cap: caps.repost },
      comment: { done: engageToday.comment, cap: caps.comment },
    },
  };
}
