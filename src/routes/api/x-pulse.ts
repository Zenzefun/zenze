import { createFileRoute } from "@tanstack/react-router";

function isLoopback(request: Request) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const loopHost = host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  const xf = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const real = (request.headers.get("x-real-ip") ?? "").trim();
  const cf = (request.headers.get("cf-connecting-ip") ?? "").trim();
  if (loopHost && !xf && !real && !cf) return true;
  const ip = real || xf || cf;
  return ip === "127.0.0.1" || ip === "::1" || ip === ":ffff:127.0.0.1";
}

function secretOk(request: Request) {
  const secret = process.env.X_PULSE_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-pulse-secret") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return header === secret || bearer === secret;
}

async function handle(request: Request) {
  if (!isLoopback(request) && !secretOk(request)) {
    return Response.json({ ok: false }, { status: 404 });
  }
  const { autoLoopEnabled, ensurePulseLoop, pulseLoopStatus } = await import("@/lib/server/x-pulse-loop");
  const loop = ensurePulseLoop();
  if (!autoLoopEnabled()) {
    return Response.json({
      ok: true,
      loop: pulseLoopStatus(),
      play: "skip",
      posted: false,
      skipped: "Pulse loop idle outside production.",
    });
  }
  const { runAutonomousPulse } = await import("@/lib/server/autonomous-x");
  const result = await runAutonomousPulse("cron");
  return Response.json({
    ok: true,
    loop: loop.running ? loop : pulseLoopStatus(),
    play: result.play,
    posted: result.posted,
    skipped: result.skipped ?? null,
    error: result.error ?? null,
    queued: result.queued ?? 0,
    bottleneck: result.bottleneck ?? null,
  });
}

export const Route = createFileRoute("/api/x-pulse")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
