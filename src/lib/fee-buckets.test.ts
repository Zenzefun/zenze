import assert from "node:assert/strict";
import test from "node:test";
import { summarizeHeld, unavailableBucket } from "./fee-buckets.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

test("empty inventory is a real zero, not an unread bucket", () => {
  const bucket = summarizeHeld([{ address: ZERO, symbol: "ETH", amount: 0, usd: 0 }]);
  assert.equal(bucket.deployed, true);
  assert.equal(bucket.empty, true);
  assert.equal(bucket.usd, 0);
  assert.equal(bucket.rows.length, 0);
});

test("priced assets sum and keep the six largest", () => {
  const rows = [
    { address: ZERO, symbol: "ETH", amount: 2, usd: 200 },
    { address: "0x1", symbol: "NVDA", amount: 1, usd: 50 },
    { address: "0x2", symbol: "SPY", amount: 1, usd: 40 },
    { address: "0x3", symbol: "A", amount: 1, usd: 1 },
    { address: "0x4", symbol: "B", amount: 1, usd: 2 },
    { address: "0x5", symbol: "C", amount: 1, usd: 3 },
    { address: "0x6", symbol: "D", amount: 1, usd: 4 },
  ];
  const bucket = summarizeHeld(rows);
  assert.equal(bucket.usd, 300);
  assert.equal(bucket.native, 2);
  assert.equal(bucket.pairCount, 6);
  assert.deepEqual(bucket.rows.map((row) => row.symbol), ["ETH", "NVDA", "SPY", "D", "C", "B"]);
});

test("an unpriced asset blocks a fake dollar total", () => {
  const bucket = summarizeHeld([
    { address: ZERO, symbol: "ETH", amount: 1, usd: 100 },
    { address: "0xabc", symbol: "0xabc…", amount: 4, usd: null },
  ]);
  assert.equal(bucket.usd, null);
  assert.equal(bucket.rows.length, 2);
});

test("unavailable is distinct from an empty deployed bucket", () => {
  const missing = unavailableBucket();
  assert.equal(missing.deployed, false);
  assert.equal(missing.usd, null);
});
