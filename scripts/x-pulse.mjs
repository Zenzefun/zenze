#!/usr/bin/env node
/**
 * PM2 cron helper. Hits the in-process pulse on the local node server.
 * Never call this against the public origin — loopback only.
 */
const port = process.env.NITRO_PORT || process.env.PORT || "3000";
const secret = process.env.X_PULSE_SECRET || "";
const url = `http://127.0.0.1:${port}/api/x-pulse`;
const headers = { accept: "application/json" };
if (secret) headers["x-pulse-secret"] = secret;

try {
  const res = await fetch(url, { method: "POST", headers });
  const text = await res.text();
  if (!res.ok) {
    console.error("[x-pulse]", res.status, text.slice(0, 200));
    process.exit(1);
  }
  console.log("[x-pulse]", text.slice(0, 240));
} catch (err) {
  console.error("[x-pulse]", err instanceof Error ? err.message : err);
  process.exit(1);
}
