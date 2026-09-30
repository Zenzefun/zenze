import { configValue } from "@/lib/server/secrets";
import { createTweetViaApis, twitterapisConfigured, xCookiesReady, xSessionStatus } from "@/lib/server/twitterapis";
import { tweetText } from "@/lib/server/maya/shape";

const X_TWEET_URL = "https://api.x.com/2/tweets";

export async function xHandle() {
  return ((await configValue("x_handle")) ?? "ZenzeFun").replace(/^@/, "");
}

export async function xProfileUrl() {
  return `https://x.com/${await xHandle()}`;
}

export function xIntentUrl(text: string, _path = "/") {
  const u = new URL("https://x.com/intent/tweet");
  u.searchParams.set("text", tweetText(text));
  return u.toString();
}

async function bearer() {
  return configValue("x_bearer_token");
}

export async function xPublishReady() {
  if (await twitterapisConfigured()) {
    if (await xCookiesReady()) return true;
    const session = await xSessionStatus();
    if (session.ready) return true;
  }
  return Boolean(await bearer());
}

async function publishViaOfficialApi(trimmed: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const token = await bearer();
  if (!token) return { ok: false, error: "No X bearer token." };
  try {
    const res = await fetch(X_TWEET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: trimmed }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `X returned ${res.status}. ${body.slice(0, 180)}` };
    }
    const json = (await res.json()) as { data?: { id?: string } };
    return { ok: true, id: json.data?.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach X." };
  }
}

export async function publishTweet(
  text: string,
  replyTo?: string,
  quoteTo?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string; intent: string }> {
  const kind = replyTo ? "reply" : quoteTo ? "quote" : "original";
  const trimmed = tweetText(text, kind);
  const intent = xIntentUrl(trimmed);
  const handle = await xHandle();

  if (await twitterapisConfigured()) {
    const posted = await createTweetViaApis(trimmed, replyTo, quoteTo);
    if (posted.ok) return posted;
    const official = await bearer();
    if (official && !quoteTo) {
      const fallback = await publishViaOfficialApi(trimmed);
      if (fallback.ok) return fallback;
    }
    return { ok: false, error: posted.error, intent };
  }

  const token = await bearer();
  if (!token) {
    return {
      ok: false,
      error: `X is not connected. Draft is ready — open the intent to post as @${handle}.`,
      intent,
    };
  }
  const official = await publishViaOfficialApi(trimmed);
  if (official.ok) return official;
  return { ok: false, error: official.error, intent };
}
