import assert from "node:assert/strict";
import test from "node:test";
import { applyTransfer, positiveHolders } from "./holders.ts";

const zero = "0x" + "0".repeat(40);
const a = "0x" + "a".repeat(40);
const b = "0x" + "b".repeat(40);

test("holders are addresses that still have tokens, counted from transfers", () => {
  const balances = new Map<string, bigint>();
  applyTransfer(balances, zero, a, 100n);
  applyTransfer(balances, zero, b, 40n);
  applyTransfer(balances, a, b, 100n);
  applyTransfer(balances, b, zero, 20n);
  assert.equal(positiveHolders(balances), 1);
  assert.equal(balances.get(b), 120n);
});
