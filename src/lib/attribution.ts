/**
 * First-party UTM + session attribution. Cookie-less.
 * Mirrors src/lib/referral.ts. First-touch wins for the session.
 */

const UTM_KEY = "zenze.utm";
const SESSION_KEY = "zenze.sid";

export type Utm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

const MAX = 64;
const ALLOW = /^[a-z0-9._-]+$/i;

function sanitize(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX) return undefined;
  if (trimmed.toLowerCase().startsWith("javascript:")) return undefined;
  if (!ALLOW.test(trimmed)) return undefined;
  return trimmed;
}

export function parseUtm(search: string): Utm {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const utm: Utm = {};
  const source = sanitize(params.get("utm_source"));
  const medium = sanitize(params.get("utm_medium"));
  const campaign = sanitize(params.get("utm_campaign"));
  const content = sanitize(params.get("utm_content"));
  const term = sanitize(params.get("utm_term"));
  if (source) utm.source = source;
  if (medium) utm.medium = medium;
  if (campaign) utm.campaign = campaign;
  if (content) utm.content = content;
  if (term) utm.term = term;
  return utm;
}

function hasAny(utm: Utm): boolean {
  return !!(utm.source || utm.medium || utm.campaign || utm.content || utm.term);
}

/** Persist first non-empty UTM. Do not overwrite with empty. */
export function captureUtm(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const incoming = parseUtm(window.location.search);
    const existingRaw = sessionStorage.getItem(UTM_KEY) ?? localStorage.getItem(UTM_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as Utm) : {};
    // First-touch: only write if nothing stored yet, or if stored is empty and incoming has values.
    if (!hasAny(existing) && hasAny(incoming)) {
      const json = JSON.stringify(incoming);
      sessionStorage.setItem(UTM_KEY, json);
      localStorage.setItem(UTM_KEY, json);
      return incoming;
    }
    return existing;
  } catch {
    return {};
  }
}

export function storedUtm(): Utm {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(UTM_KEY) ?? localStorage.getItem(UTM_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Utm;
    return {
      source: sanitize(parsed.source),
      medium: sanitize(parsed.medium),
      campaign: sanitize(parsed.campaign),
      content: sanitize(parsed.content),
      term: sanitize(parsed.term),
    };
  } catch {
    return {};
  }
}

export function sessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function shouldRecordPageviews(): boolean {
  if (typeof navigator === "undefined") return true;
  if (navigator.doNotTrack === "1") return false;
  // globalPrivacyControl is not in all TS libs yet
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  if (gpc === true) return false;
  return true;
}

const started = new Set<string>();

/** Best-effort beacon. Dedup launch_form_start once per session. */
export function track(name: "pageview" | "launch_form_start" | "launch_form_complete", path?: string) {
  if (typeof window === "undefined") return;
  if (name === "pageview" && !shouldRecordPageviews()) return;
  if (name === "launch_form_start") {
    const sid = sessionId();
    if (started.has(sid)) return;
    started.add(sid);
  }
  const utm = storedUtm();
  const payload = {
    name,
    path: path ?? window.location.pathname,
    sessionId: sessionId(),
    referrerHost: document.referrer ? new URL(document.referrer).hostname : undefined,
    ...utm,
  };
  const body = JSON.stringify(payload);
  const url = "/api/event";
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  } else {
    void fetch(url, { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }
}
