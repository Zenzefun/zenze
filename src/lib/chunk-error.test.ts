import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHUNK_RECOVERY_BOOT, chunkErrorCopy, isChunkLoadError } from "./chunk-error.ts";

describe("chunk-error", () => {
  it("detects chrome/firefox/safari module fetch failures", () => {
    assert.equal(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://zenze.fun/assets/routes-BeShn2cj.js")),
      true,
    );
    assert.equal(isChunkLoadError("error loading dynamically imported module: https://zenze.fun/assets/x.js"), true);
    assert.equal(isChunkLoadError("Importing a module script failed."), true);
    assert.equal(isChunkLoadError(new Error("Loading chunk routes-BeShn2cj.js failed")), true);
    assert.equal(isChunkLoadError(new Error("wallet rejected")), false);
  });

  it("never surfaces the raw chunk URL", () => {
    const copy = chunkErrorCopy(
      new Error("Failed to fetch dynamically imported module: https://zenze.fun/assets/routes-BeShn2cj.js"),
    );
    assert.equal(copy.includes("assets/"), false);
    assert.equal(/reload/i.test(copy), true);
  });

  it("boot script matches the live chrome error and does not loop", () => {
    assert.match(CHUNK_RECOVERY_BOOT, /vite:preloadError/);
    assert.match(CHUNK_RECOVERY_BOOT, /zenze-chunk-reload/);
    assert.match(CHUNK_RECOVERY_BOOT, /Failed to fetch dynamically imported module/);
    assert.match(CHUNK_RECOVERY_BOOT, /Loading chunk \[\\w\.\/-\]\+ failed/);
    assert.doesNotMatch(CHUNK_RECOVERY_BOOT, /assets\//);
  });
});
