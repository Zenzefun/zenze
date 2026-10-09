import { definePlugin } from "nitro";

/**
 * Arm the in-process X loop after boot.
 * A restart used to sit silent until something else requested /health.
 * This calls that route from inside the process and retries unless the
 * loop reports itself running. It does not post. The loop timer does.
 */
export default definePlugin(() => {
  if (process.env.NODE_ENV !== "production") return;
  const port = process.env.PORT || "3010";
  let tries = 0;
  const arm = () => {
    tries += 1;
    fetch(`http://127.0.0.1:${port}/health`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { pulse?: { running?: boolean } } | null;
        if (!res.ok || body?.pulse?.running !== true) throw new Error(String(res.status));
      })
      .catch(() => {
        if (tries < 6) setTimeout(arm, 3000);
        else console.error("[x-pulse] loop was not armed");
      });
  };
  setTimeout(arm, 3000);
});
