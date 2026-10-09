/** Request shapes from docs.twitterapis.com, October 2026. */

export function createTweetBody(text: string, replyTo?: string, quoteTo?: string) {
  const body: Record<string, string> = { text };
  if (replyTo) body.reply_to = replyTo;
  if (quoteTo) body.quote = quoteTo;
  return body;
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pick(obj: Record<string, unknown> | null, keys: string[]) {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

export function readWrite(json: unknown): { ok: true; id: string } | { ok: false; error: string } {
  const rec = record(json) ?? {};
  const data = record(rec.data) ?? rec;
  if (rec.ok === false || data.ok === false) {
    return { ok: false, error: pick(rec, ["message", "error"]) || pick(data, ["message", "error"]) || "TwitterAPIs refused the write." };
  }
  const id = pick(data, ["tweet_id", "id", "rest_id"]) || pick(rec, ["tweet_id", "id"]);
  if (rec.ok === true || data.ok === true || id) return { ok: true, id };
  return { ok: false, error: "TwitterAPIs did not confirm the write." };
}

export function readError(status: number, text: string) {
  let message = "";
  try {
    const json = JSON.parse(text) as unknown;
    const rec = record(json);
    message = pick(rec, ["message", "error"]);
  } catch {
    message = "";
  }
  if (status === 401 || /session_dead/i.test(message)) return "The X session expired. Paste a fresh auth_token and ct0 in Settings.";
  if (status === 409 || /session_required/i.test(message)) return "No logged-in X session. Link the cookies once.";
  if (status === 402 || /insufficient_credits/i.test(message)) return "TwitterAPIs credits are empty.";
  if (status === 403) return message || "X refused the write. The cookies are still valid, so they were not registered again.";
  return message || text.slice(0, 240) || `TwitterAPIs ${status}`;
}
