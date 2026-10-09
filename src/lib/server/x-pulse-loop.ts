import { env } from "@/lib/env.server";

const TICK_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 90_000;

type LoopState = {
  timer: ReturnType<typeof setInterval> | null;
  boot: ReturnType<typeof setTimeout> | null;
  watch: ReturnType<typeof setInterval> | null;
  startedAt: number;
  lastAt: number | null;
  lastPlay: string | null;
  ticks: number;
  running: boolean;
  ticking: boolean;
};

const g = globalThis as typeof globalThis & { __zenzeXPulse?: LoopState };

function state(): LoopState {
  if (!g.__zenzeXPulse) {
    g.__zenzeXPulse = {
      timer: null,
      boot: null,
      watch: null,
      startedAt: 0,
      lastAt: null,
      lastPlay: null,
      ticks: 0,
      running: false,
      ticking: false,
    };
  }
  return g.__zenzeXPulse;
}

/** Production VPS only. Preview `npm run dev` must never auto-tweet. */
export function autoLoopEnabled() {
  return process.env.NODE_ENV === "production" || env("ZENZE_X_AUTO") === "1";
}

export function pulseLoopStatus() {
  const s = state();
  return {
    enabled: autoLoopEnabled(),
    running: s.running,
    startedAt: s.startedAt || null,
    lastAt: s.lastAt,
    lastPlay: s.lastPlay,
    ticks: s.ticks,
  };
}

function armInterval(s: LoopState) {
  if (s.timer) clearInterval(s.timer);
  s.timer = setInterval(() => {
    void tick("cron");
  }, TICK_MS);
}

export function ensurePulseLoop() {
  const s = state();
  if (!autoLoopEnabled()) return pulseLoopStatus();
  if (s.running) return pulseLoopStatus();
  s.running = true;
  s.startedAt = Date.now();
  s.boot = setTimeout(() => {
    void tick("boot");
    armInterval(s);
  }, BOOT_DELAY_MS);
  if (!s.watch) {
    s.watch = setInterval(() => {
      const live = state();
      if (!live.running || live.ticking) return;
      const beat = live.lastAt || live.startedAt;
      const missing = !live.timer && beat > 0 && Date.now() - beat > BOOT_DELAY_MS + TICK_MS;
      const stale = Boolean(live.timer) && beat > 0 && Date.now() - beat > TICK_MS * 2;
      if (missing || stale) {
        console.error("[x-pulse] timer stale, re-arming");
        armInterval(live);
      }
    }, TICK_MS);
  }
  return pulseLoopStatus();
}

async function tick(reason: "cron" | "boot") {
  const s = state();
  if (s.ticking) return;
  s.ticking = true;
  try {
    const { runAutonomousPulse } = await import("./autonomous-x");
    const result = await runAutonomousPulse(reason);
    s.lastAt = Date.now();
    s.lastPlay = result.play;
    s.ticks += 1;
    const why = result.error || result.skipped || "";
    console.info(`[x-pulse] ${reason} play=${result.play} posted=${result.posted}${why ? ` ${why}` : ""}`);
    try {
      const { runTelegramPulse } = await import("./telegram-pulse.server");
      await runTelegramPulse();
    } catch (err) {
      console.error("[x-pulse] telegram", err instanceof Error ? err.message : err);
    }
  } catch (err) {
    s.lastAt = Date.now();
    s.lastPlay = "error";
    s.ticks += 1;
    console.error("[x-pulse] tick failed", err instanceof Error ? err.message : err);
  } finally {
    s.ticking = false;
  }
}
