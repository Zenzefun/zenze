import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanTokenName, cleanTokenSymbol, isUnnamedTokenName, parseTokenMeta } from "./token-name.ts";

describe("token-name", () => {
  it("keeps a real name", () => {
    assert.equal(cleanTokenName("Zenze", "ZNZF"), "Zenze");
    const capy = parseTokenMeta("Capy Pond", "CAPY");
    assert.equal(capy.ok, true);
    if (capy.ok) {
      assert.equal(capy.name, "Capy Pond");
      assert.equal(capy.symbol, "CAPY");
    }
  });

  it("never stores unnamed placeholders", () => {
    assert.equal(cleanTokenName("Unnamed Token", "CAPY"), "CAPY");
    assert.equal(cleanTokenName("unnamed", "CAPY"), "CAPY");
    assert.equal(cleanTokenName("  ", "CAPY"), "CAPY");
    assert.equal(isUnnamedTokenName("Unnamed Token"), true);
    assert.equal(isUnnamedTokenName("Bulu Babi"), false);
    assert.equal(parseTokenMeta("Unnamed Token", "CAPY").ok, false);
    assert.equal(parseTokenMeta("unnamed token", "CAPY").ok, false);
    assert.equal(parseTokenMeta("", "CAPY").ok, false);
    assert.equal(parseTokenMeta("Zenze", "ZNZF").ok, false);
  });

  it("cleans tickers", () => {
    assert.equal(cleanTokenSymbol(" znzf! "), "ZNZF");
  });
});
