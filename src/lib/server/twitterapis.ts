import { configValue } from "@/lib/server/secrets";
import { tweetText } from "@/lib/server/maya/shape";

const BASE = "https://api.twitterapis.com";

export type XSessionStatus = {
  ready: boolean;
  registered: boolean;
  username: string | null;
  status: string;
  note: string;
};

export type XMention = {
  id: string;
  text: string;
  url: string;
  author: string;
  authorId: string;
  createdAt: string;
  likes: number;
  replies: number;
  retweets: number;
  quotes: number;
  views: number;
};

export type XUser = {
  id: string;
  username: string;
  name: string;
  description: string;
  followers: number;
};

type CallOk = { ok: true; json: unknown; text: string };
type CallErr = { ok: false; status: number; error: string };
type WriteResult = { ok: true } | { ok: false; error: string; status?: number };

async function apiKey() {
  return (await configValue("twitterapis_key"))?.trim();
}

async function cookies() {
  const auth_token = (await configValue("x_auth_token"))?.trim();
  const ct0 = (await configValue("x_ct0"))?.trim();
  if (!auth_token || !ct0) return null;
  return { auth_token, ct0 };
}

function headers(key: string, creds?: { auth_token: string; ct0: string } | null) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "x-api-key": key,
    accept: "application/json",
  };
  if (creds) {
    h["x-auth-token"] = creds.auth_token;
    h["x-ct0"] = creds.ct0;
  }
  return h;
}

async function call(
  path: string,
  opts: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | undefined>;
    json?: Record<string, unknown>;
    creds?: { auth_token: string; ct0: string } | null;
  } = {},
): Promise<CallOk | CallErr> {
  const key = await apiKey();
  if (!key) return { ok: false, status: 0, error: "TwitterAPIs key is not set." };
  const method = opts.method ?? (opts.json ? "POST" : "GET");
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const h = headers(key, opts.creds ?? null);
  if (opts.json) h["content-type"] = "application/json";
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: h,
      body: opts.json ? JSON.stringify(opts.json) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 240) || `TwitterAPIs ${res.status}` };
    }
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { ok: true, json, text };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Could not reach TwitterAPIs." };
  }
}

function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function twitterapisConfigured() {
  return Boolean(await apiKey());
}

export async function xCookiesReady() {
  return Boolean(await cookies());
}

export async function twitterapisPing(): Promise<{ ok: boolean; error?: string }> {
  const res = await call("/twitter/tweet/advanced_search", {
    query: { query: "from:ZenzeFun", product: "Latest", count: 1 },
  });
  if (res.ok) return { ok: true };
  const me = await call("/account/me");
  if (me.ok) return { ok: true };
  return { ok: false, error: res.error };
}

function statusFromJson(raw: unknown, hasCookies: boolean): XSessionStatus {
  const json = asRecord(raw) ?? {};
  const data = asRecord(json.data) ?? json;
  const registered = Boolean(data.registered ?? data.ok ?? data.username ?? data.twitter_user_id);
  const username = pickString(data, ["username", "screen_name", "handle"]);
  const status = pickString(data, ["status"]) ?? (registered ? "ok" : "none");
  const note =
    pickString(data, ["note"]) ??
    (status === "dead"
      ? "X rejected the cookies. Paste a fresh auth_token and ct0."
      : registered
        ? `Posting as @${username ?? "ZenzeFun"}.`
        : hasCookies
          ? "Cookies are set. Link the session once."
          : "No X session yet.");
  return {
    ready: registered && status !== "dead",
    registered,
    username,
    status,
    note,
  };
}

export async function linkXSession(): Promise<{ ok: true; username: string | null } | { ok: false; error: string }> {
  const creds = await cookies();
  if (!creds) return { ok: false, error: "Paste the X auth_token and ct0 cookies in Settings first." };
  const body = {
    auth_token: creds.auth_token,
    ct0: creds.ct0,
    cookie: `auth_token=${creds.auth_token}; ct0=${creds.ct0}`,
    user_agent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  };
  const res = await call("/twitter/customer/session", { method: "POST", json: body });
  const used = res.ok ? res : await call("/twitter/account/session/register", { method: "POST", json: body });
  if (!used.ok) return { ok: false, error: used.error };
  const json = asRecord(used.json);
  const username =
    pickString(json, ["username", "screen_name", "handle"]) ?? pickString(asRecord(json?.data), ["username", "screen_name"]);
  return { ok: true, username };
}

export async function xSessionStatus(): Promise<XSessionStatus> {
  const hasKey = await twitterapisConfigured();
  const hasCookies = await xCookiesReady();
  if (!hasKey) {
    return { ready: false, registered: false, username: null, status: "missing_key", note: "Add the TwitterAPIs key in Settings." };
  }
  const res = await call("/twitter/customer/session/status");
  if (!res.ok) {
    const alt = await call("/twitter/account/session/status");
    if (alt.ok) return statusFromJson(alt.json, hasCookies);
    return {
      ready: hasCookies,
      registered: false,
      username: null,
      status: res.status === 404 ? "none" : "error",
      note: hasCookies ? "Cookies are set. Link the session to publish as @ZenzeFun." : res.error,
    };
  }
  return statusFromJson(res.json, hasCookies);
}

function tweetIdFrom(json: unknown): string {
  const rec = asRecord(json) ?? {};
  const data = asRecord(rec.data) ?? rec;
  return pickString(data, ["tweet_id", "id", "rest_id"]) ?? pickString(rec, ["tweet_id", "id"]) ?? "";
}

export async function createTweetViaApis(
  text: string,
  replyTo?: string,
  quoteTo?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = tweetText(text);
  if (!trimmed) return { ok: false, error: "Nothing to post." };
  const creds = await cookies();
  const linked = await xSessionStatus();
  if (!linked.ready && creds) {
    await linkXSession();
  }
  const query: Record<string, string | number | undefined> = { text: trimmed };
  const json: Record<string, unknown> = { text: trimmed };
  if (replyTo) {
    query.reply_to_tweet_id = replyTo;
    query.in_reply_to_status_id = replyTo;
    json.reply_to_tweet_id = replyTo;
  }
  if (quoteTo) {
    query.quote_tweet_id = quoteTo;
    query.attachment_url = `https://x.com/i/web/status/${quoteTo}`;
    json.quote_tweet_id = quoteTo;
    json.attachment_url = `https://x.com/i/web/status/${quoteTo}`;
  }
  const res = await call("/twitter/tweet/create", {
    method: "POST",
    query,
    json: replyTo || quoteTo ? json : undefined,
    creds,
  });
  if (!res.ok) {
    if (res.status === 409 && creds) {
      const again = await linkXSession();
      if (again.ok) {
        const retry = await call("/twitter/tweet/create", { method: "POST", query, json, creds });
        if (retry.ok) {
          const id = tweetIdFrom(retry.json);
          return { ok: true, id };
        }
        return { ok: false, error: retry.ok ? "No tweet id returned." : retry.error };
      }
    }
    return { ok: false, error: res.error };
  }
  return { ok: true, id: tweetIdFrom(res.json) };
}

async function writeAction(path: string, query: Record<string, string>, json?: Record<string, unknown>): Promise<WriteResult> {
  const creds = await cookies();
  const linked = await xSessionStatus();
  if (!linked.ready && creds) await linkXSession();
  const res = await call(path, { method: "POST", query, json: json ?? query, creds });
  if (!res.ok && res.status === 409 && creds) {
    const again = await linkXSession();
    if (again.ok) {
      const retry = await call(path, { method: "POST", query, json: json ?? query, creds });
      return retry.ok ? { ok: true } : { ok: false, error: retry.error, status: retry.status };
    }
  }
  return res.ok ? { ok: true } : { ok: false, error: res.error, status: res.status };
}

/** POST /twitter/tweet/favorite — docs: id or url. */
export async function favoriteTweet(tweetId: string): Promise<WriteResult> {
  const id = tweetId.trim();
  if (!id) return { ok: false, error: "Missing tweet id." };
  return writeAction("/twitter/tweet/favorite", { id, tweet_id: id }, { id, tweet_id: id });
}

/** POST /twitter/tweet/retweet — docs: id or url. */
export async function retweetTweet(tweetId: string): Promise<WriteResult> {
  const id = tweetId.trim();
  if (!id) return { ok: false, error: "Missing tweet id." };
  return writeAction("/twitter/tweet/retweet", { id, tweet_id: id }, { id, tweet_id: id });
}

export async function lookupUser(username: string): Promise<XUser | null> {
  const handle = username.replace(/^@/, "").trim();
  if (!handle) return null;
  const res = await call("/twitter/user/info", { query: { username: handle } });
  if (!res.ok) return null;
  const rec = asRecord(res.json) ?? {};
  const user = asRecord(rec.user) ?? asRecord(rec.data) ?? rec;
  const id = pickString(user, ["id", "rest_id", "user_id"]);
  const uname = pickString(user, ["username", "screen_name", "handle"]) ?? handle;
  if (!id && !uname) return null;
  const followers = Number(user.followers_count ?? user.followers ?? asRecord(user.public_metrics)?.followers_count ?? 0);
  return {
    id: id ?? "",
    username: uname,
    name: pickString(user, ["name", "display_name"]) ?? uname,
    description: pickString(user, ["description", "bio"]) ?? "",
    followers: Number.isFinite(followers) ? followers : 0,
  };
}

/** POST /twitter/user/follow — docs require user_id; username is sent as a fallback. */
export async function followUser(input: { userId?: string; username?: string }): Promise<WriteResult> {
  const username = input.username?.replace(/^@/, "").trim();
  let userId = input.userId?.trim();
  if (!userId && username) {
    const profile = await lookupUser(username);
    userId = profile?.id || undefined;
  }
  if (!userId && !username) return { ok: false, error: "Need a user id or username." };
  const query: Record<string, string> = {};
  if (userId) query.user_id = userId;
  if (username) query.username = username;
  return writeAction("/twitter/user/follow", query, { ...query });
}

function mentionsFrom(json: unknown): XMention[] {
  const rec = asRecord(json) ?? {};
  const rows = (Array.isArray(rec.tweets) ? rec.tweets : Array.isArray(rec.data) ? rec.data : Array.isArray(json) ? json : []) as unknown[];
  const out: XMention[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) continue;
    const user = asRecord(item.author) ?? asRecord(item.user) ?? {};
    const id = pickString(item, ["id", "tweet_id", "rest_id"]);
    const text = pickString(item, ["text", "full_text"]) ?? "";
    if (!id || !text) continue;
    const author = pickString(user, ["username", "screen_name", "handle"]) ?? "unknown";
    const authorId =
      pickString(user, ["id", "rest_id", "user_id"]) ?? pickString(item, ["user_id", "author_id", "authorId"]) ?? "";
    const likes = Number(item.like_count ?? item.favorite_count ?? asRecord(item.public_metrics)?.like_count ?? 0);
    const replies = Number(item.reply_count ?? asRecord(item.public_metrics)?.reply_count ?? 0);
    const retweets = Number(item.retweet_count ?? asRecord(item.public_metrics)?.retweet_count ?? 0);
    const quotes = Number(item.quote_count ?? asRecord(item.public_metrics)?.quote_count ?? 0);
    const views = Number(item.view_count ?? asRecord(item.public_metrics)?.impression_count ?? 0);
    out.push({
      id,
      text,
      url: pickString(item, ["url"]) ?? `https://x.com/${author}/status/${id}`,
      author,
      authorId,
      createdAt: pickString(item, ["created_at", "createdAt"]) ?? "",
      likes: Number.isFinite(likes) ? likes : 0,
      replies: Number.isFinite(replies) ? replies : 0,
      retweets: Number.isFinite(retweets) ? retweets : 0,
      quotes: Number.isFinite(quotes) ? quotes : 0,
      views: Number.isFinite(views) ? views : 0,
    });
  }
  return out.slice(0, 12);
}

export async function fetchMentions(handle: string): Promise<XMention[]> {
  const res = await call("/twitter/user/mentions", {
    query: { username: handle.replace(/^@/, ""), count: 20 },
  });
  if (!res.ok) return [];
  return mentionsFrom(res.json);
}

export async function searchTweets(query: string): Promise<XMention[]> {
  const res = await call("/twitter/tweet/advanced_search", {
    query: { query, product: "Latest", count: 20 },
  });
  if (!res.ok) return [];
  return mentionsFrom(res.json);
}
