import { configValue } from "@/lib/server/secrets";
import { tweetText } from "@/lib/server/maya/shape";
import { createTweetBody, readError, readWrite } from "@/lib/server/twitterapis-shape";

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

const readCache = new Map<string, { at: number; value: CallOk }>();
const READ_TTL_MS = 4 * 60 * 1000;

function cachedRead(key: string): CallOk | null {
  const hit = readCache.get(key);
  if (!hit || Date.now() - hit.at > READ_TTL_MS) return null;
  return hit.value;
}

export function clearTwitterReadCache() {
  readCache.clear();
}

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
  const cacheKey = method === "GET" ? url.toString() : "";
  if (cacheKey) {
    const hit = cachedRead(cacheKey);
    if (hit) return hit;
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
      return { ok: false, status: res.status, error: readError(res.status, text) };
    }
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    const ok: CallOk = { ok: true, json, text };
    if (cacheKey) readCache.set(cacheKey, { at: Date.now(), value: ok });
    return ok;
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
  const me = await call("/account/me");
  return me.ok ? { ok: true } : { ok: false, error: me.error };
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
  if (!res.ok) return { ok: false, error: res.error };
  clearTwitterReadCache();
  const json = asRecord(res.json);
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

export async function createTweetViaApis(
  text: string,
  replyTo?: string,
  quoteTo?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = tweetText(text);
  if (!trimmed) return { ok: false, error: "Nothing to post." };
  const creds = await cookies();
  const body = createTweetBody(trimmed, replyTo, quoteTo);
  const res = await call("/twitter/tweet/create", { method: "POST", json: body, creds });
  if (!res.ok) {
    if (res.status === 409 && creds) {
      const again = await linkXSession();
      if (again.ok) {
        const retry = await call("/twitter/tweet/create", { method: "POST", json: body, creds });
        if (!retry.ok) return { ok: false, error: retry.error };
        const parsed = readWrite(retry.json);
        return parsed.ok ? parsed : { ok: false, error: parsed.error };
      }
    }
    return { ok: false, error: res.error };
  }
  const parsed = readWrite(res.json);
  return parsed.ok ? parsed : { ok: false, error: parsed.error };
}

async function writeAction(
  path: string,
  input: { query?: Record<string, string>; json?: Record<string, unknown> },
): Promise<WriteResult> {
  const creds = await cookies();
  const send = () => call(path, { method: "POST", query: input.query, json: input.json, creds });
  let res = await send();
  if (!res.ok && res.status === 409 && creds) {
    const again = await linkXSession();
    if (again.ok) res = await send();
  }
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  const parsed = readWrite(res.json);
  return parsed.ok ? { ok: true } : { ok: false, error: parsed.error };
}

/** POST /twitter/tweet/favorite — the id is a query parameter, not a body field. */
export async function favoriteTweet(tweetId: string): Promise<WriteResult> {
  const id = tweetId.trim();
  if (!id) return { ok: false, error: "Missing tweet id." };
  return writeAction("/twitter/tweet/favorite", { query: { id } });
}

/** POST /twitter/tweet/retweet — the id is a query parameter. */
export async function retweetTweet(tweetId: string): Promise<WriteResult> {
  const id = tweetId.trim();
  if (!id) return { ok: false, error: "Missing tweet id." };
  return writeAction("/twitter/tweet/retweet", { query: { id } });
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

/** POST /twitter/user/follow — username alone is enough. Looking the id up first spends a read. */
export async function followUser(input: { userId?: string; username?: string }): Promise<WriteResult> {
  const username = input.username?.replace(/^@/, "").trim();
  const userId = input.userId?.trim();
  if (!userId && !username) return { ok: false, error: "Need a user id or username." };
  const body: Record<string, string> = {};
  if (userId) body.user_id = userId;
  if (username) body.username = username;
  return writeAction("/twitter/user/follow", { json: body });
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
