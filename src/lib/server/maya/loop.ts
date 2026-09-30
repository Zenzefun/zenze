import { configValue } from "@/lib/server/secrets";
import { xHandle, xPublishReady } from "@/lib/server/x";
import { learnFromOwnPosts, persistPlan } from "./learn";
import { observe } from "./observe";
import { decide } from "./decide";
import { act, rejectMillQueue, type ActResult, type PulsePlay } from "./act";

export type PulseResult = {
  ok: boolean;
  play: PulsePlay;
  posted: boolean;
  skipped?: string;
  text?: string;
  id?: number;
  xPostId?: string;
  error?: string;
  queued?: number;
  bottleneck?: string;
  note?: string;
};

async function autoOn() {
  const v = (await configValue("x_auto_on")) ?? "true";
  return v === "true" || v === "1" || v === "on";
}

async function runPulseOnce(reason: "cron" | "desk" | "boot"): Promise<PulseResult> {
  if (!(await autoOn()) && reason !== "desk") {
    return { ok: true, play: "skip", posted: false, skipped: "Autonomous posting is paused." };
  }
  if (!(await xPublishReady()) && reason !== "desk") {
    return { ok: true, play: "skip", posted: false, skipped: "X session is not live." };
  }

  const handle = await xHandle();
  await learnFromOwnPosts(handle);
  await rejectMillQueue();
  const obs = await observe(handle);
  const plan = await decide(obs);
  if ("error" in plan) {
    return { ok: false, play: "skip", posted: false, error: plan.error, bottleneck: obs.memory.bottleneck };
  }
  await persistPlan({ strategy: plan.strategy, bottleneck: plan.bottleneck, note: plan.note });
  const result = await act(plan, obs);
  return {
    ok: !result.error,
    play: result.play,
    posted: result.posted,
    skipped: result.skipped,
    text: result.text,
    id: result.id,
    xPostId: result.xPostId,
    error: result.error,
    queued: result.queued,
    bottleneck: plan.bottleneck,
    note: plan.note,
  };
}

export async function runAutonomousPulse(reason: "cron" | "desk" | "boot" = "cron"): Promise<PulseResult> {
  const g = globalThis as typeof globalThis & { __zenzePulseLock?: Promise<PulseResult> | null };
  if (g.__zenzePulseLock) return g.__zenzePulseLock;
  g.__zenzePulseLock = runPulseOnce(reason).finally(() => {
    g.__zenzePulseLock = null;
  });
  return g.__zenzePulseLock;
}

export type { PulsePlay, ActResult };
