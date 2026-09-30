import { env } from "@/lib/env.server";

const TICK_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 90_000;

type LoopState = {
  timer: ReturnType<typeof setInterval> | null;
  boot: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  lastAt: number | null;
  lastPlay: string | null;
  ticks: number;
  running: boolean;
};

const g = globalThis as typeof globalThis & { __zenzeXPulse?: LoopState };

function state(): LoopState {
  if (!g.__zenzeXPulse) {
    g.__zenzeXPulse = {
      timer: null,
      boot: null,
      startedAt: 0,
      lastAt: null,
      lastPlay: null,
      ticks: 0,
      running: false,
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

export function ensurePulseLoop() {
  const s = state();
  if (!autoLoopEnabled()) return pulseLoopStatus();
  if (s.running) return pulseLoopStatus();
  s.running = true;
  s.startedAt = Date.now();
  s.boot = setTimeout(() => {
    void tick("boot");
    s.timer = setInterval(() => {
      void tick("cron");
    }, TICK_MS);
  }, BOOT_DELAY_MS);
  return pulseLoopStatus();
}

async function tick(reason: "cron" | "boot") {
  const s = state();
  try {
    const { runAutonomousPulse } = await import("./autonomous-x");
    const result = await runAutonomousPulse(reason);
    s.lastAt = Date.now();
    s.lastPlay = result.play;
    s.ticks += 1;
    try {
      const { runTelegramPulse } = await import("./telegram-pulse.server");
      await runTelegramPulse();
    } catch {
      // The room pulse must not stop the X loop.
    }
  } catch {
    s.lastAt = Date.now();
    s.lastPlay = "error";
    s.ticks += 1;
  }
}
