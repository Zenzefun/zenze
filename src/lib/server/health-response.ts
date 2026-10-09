import { ensurePulseLoop, pulseLoopStatus } from "@/lib/server/x-pulse-loop";
import { pulseArmed } from "@/lib/server/maya/shape";

export { pulseArmed };

/** Single health payload. /health and /api/health must not drift. */
export async function healthResponse() {
  let pulse = { enabled: false, running: false, startedAt: null as number | null, lastAt: null as number | null, lastPlay: null as string | null, ticks: 0 };
  try {
    pulse = ensurePulseLoop();
  } catch {
    pulse = pulseLoopStatus();
  }
  return Response.json({
    ok: true,
    service: "zenze",
    time: new Date().toISOString(),
    pulse,
  });
}
