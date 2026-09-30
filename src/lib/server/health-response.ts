import { ensurePulseLoop } from "@/lib/server/x-pulse-loop";

/** Single health payload. /health and /api/health must not drift. */
export async function healthResponse() {
  try {
    ensurePulseLoop();
  } catch {
    // health stays up even if the pulse loop cannot start
  }
  return Response.json({
    ok: true,
    service: "zenze",
    time: new Date().toISOString(),
  });
}
