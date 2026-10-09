export type OperatorSession = {
  wallet: string;
  signature: string;
  timestamp: number;
};

const KEY = "zenze.operator";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

export function readOperatorSession(): OperatorSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY) ?? (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OperatorSession;
    if (!parsed?.wallet || !parsed.signature || !parsed.timestamp) return null;
    if (!Number.isFinite(parsed.timestamp) || Math.abs(Date.now() - parsed.timestamp) > MAX_AGE_MS) {
      store.removeItem(KEY);
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        // ignore
      }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeOperatorSession(session: OperatorSession) {
  const payload = JSON.stringify(session);
  const stores: Storage[] = [];
  try {
    stores.push(localStorage);
  } catch {
    // blocked
  }
  try {
    stores.push(sessionStorage);
  } catch {
    // blocked
  }
  let saved = false;
  for (const store of stores) {
    try {
      store.setItem(KEY, payload);
      saved = true;
    } catch {
      // try the next store
    }
  }
  if (!saved) throw new Error("Cannot store the desk session. Allow site data for zenzen.fun and try again.");
}

export function clearOperatorSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
