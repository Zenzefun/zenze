import assert from "node:assert/strict";
import test from "node:test";
import { dayChange } from "./day-change.ts";

test("a tiny yesterday does not become a million percent", () => {
  assert.equal(dayChange(25409, 0.06, "$0.06"), "Up from $0.06 yesterday");
  assert.equal(dayChange(0, 0), "");
  assert.equal(dayChange(1, 0), "None yesterday");
  assert.equal(dayChange(1, 1), "Flat vs yesterday");
});
