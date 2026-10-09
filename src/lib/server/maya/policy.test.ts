import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("the writer prompt", () => {
  it("does not teach the domain, a fee, or a supply figure", () => {
    const src = readFileSync(new URL("./policy.ts", import.meta.url), "utf8");
    const start = src.indexOf("export const MAYA_SYSTEM");
    const body = src.slice(start);
    assert.equal(/zenze\.fun/i.test(body), false);
    assert.equal(/2%|800,000,000|2 ETH/.test(body), false);
    assert.match(body, /12 words or fewer|Twelve words or fewer/);
    assert.match(body, /https:\/\/zenzen\.fun/);
    assert.equal(/linktr\.ee/i.test(body), false);
    assert.match(body, /out loud/);
    assert.equal(/\$\{RANK_RULE\}/.test(body), false);
  });
});
