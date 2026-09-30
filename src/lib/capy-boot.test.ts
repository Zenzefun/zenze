import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOT_CSS, THEME_BOOT } from "./capy-boot.ts";

describe("capy boot", () => {
  it("never resets overlay styles (that re-shows the splash)", () => {
    assert.doesNotMatch(THEME_BOOT, /cssText/);
    assert.doesNotMatch(THEME_BOOT, /function force/);
    assert.match(THEME_BOOT, /classList.contains\("capy-ready"\)/);
    assert.match(THEME_BOOT, /add\("capy-ready"\)/);
  });

  it("hides via class, not a second overlay", () => {
    assert.match(BOOT_CSS, /html\.capy-ready #capy-boot/);
    assert.match(BOOT_CSS, /#capy-boot\.is-gone/);
    assert.doesNotMatch(BOOT_CSS, /#capy-boot\{[^}]*display:none/);
  });
});
