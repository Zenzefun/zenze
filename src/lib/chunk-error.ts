/** Stale-tab / deploy-race failures when a hashed JS chunk 404s or returns HTML. */

const CHUNK_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w./-]+ failed|Unable to preload CSS/i;

export const CHUNK_RELOAD_KEY = "zenze-chunk-reload";

export function isChunkLoadError(error: unknown): boolean {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
          ? String((error as { message: unknown }).message)
          : "";
  return CHUNK_RE.test(raw);
}

export function chunkErrorCopy(error: unknown): string {
  if (isChunkLoadError(error)) {
    return "Zenzen just updated. Reload to get the latest version.";
  }
  return "";
}

/**
 * Reload once when a hashed module 404s or comes back as HTML.
 * sessionStorage gate prevents a loop if the new build is also broken.
 */
export function reloadOnceForChunkError(): boolean {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {
    // Private mode / blocked storage: still reload once this document.
  }
  window.location.reload();
  return true;
}

/** Inline boot: auto-reload once on a stale chunk, never loop. */
export const CHUNK_RECOVERY_BOOT = `(function(){var k=${JSON.stringify(CHUNK_RELOAD_KEY)};function stale(m){return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\\w./-]+ failed|Unable to preload CSS/i.test(String(m||""))}function go(){try{if(sessionStorage.getItem(k)==="1")return;sessionStorage.setItem(k,"1")}catch(e){}location.reload()}window.addEventListener("vite:preloadError",function(e){try{e.preventDefault()}catch(x){}go()});window.addEventListener("unhandledrejection",function(e){var r=e.reason,m=r&&r.message?r.message:r;if(stale(m)){try{e.preventDefault()}catch(x){}go()}});try{if(sessionStorage.getItem(k)==="1"){setTimeout(function(){try{sessionStorage.removeItem(k)}catch(e){}},8000)}}catch(e){}})();`;
