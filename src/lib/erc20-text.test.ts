import assert from "node:assert/strict";
import test from "node:test";
import { encodeAbiParameters } from "viem";
import { decodeAbiWord } from "./erc20-text.ts";

test("a string symbol and a bytes32 symbol both decode", () => {
  const asString = encodeAbiParameters([{ type: "string" }], ["USDG"]);
  const asWord = encodeAbiParameters([{ type: "bytes32" }], [
    "0x5553444700000000000000000000000000000000000000000000000000000000",
  ]);
  assert.equal(decodeAbiWord(asString), "USDG");
  assert.equal(decodeAbiWord(asWord), "USDG");
  assert.equal(decodeAbiWord("0x"), "");
});
