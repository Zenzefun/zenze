import assert from "node:assert/strict";
import test from "node:test";
import { chartWindow, mergeTradeRows } from "./chart-window.ts";
import { floorDecimal } from "./format.ts";

const now = Date.parse("2026-10-03T00:00:00Z");

test("a 5 minute window still draws when the last trade is older", () => {
  const rows = chartWindow(
    [{ t: new Date(now - 2 * 60 * 60_000).toISOString(), p: 2 }],
    5 * 60_000,
    now,
    3,
  );
  assert.equal(rows.length >= 2, true);
  assert.equal(rows[0].p, 2);
  assert.equal(rows[0].ts, now - 5 * 60_000);
  assert.equal(rows[rows.length - 1].p, 3);
  assert.equal(rows[rows.length - 1].ts >= now, true);
});

test("amounts used in a transaction are cut down, never rounded up", () => {
  assert.equal(floorDecimal(1.23459, 4), "1.2345");
  assert.equal(floorDecimal(0.00000019, 6), "0");
});

test("a window does not start at the live price when the only trades are inside it", () => {
  const rows = chartWindow([{ t: new Date(now - 30_000).toISOString(), p: 1 }], 5 * 60_000, now, 1.5);
  assert.equal(rows[0].p, 1);
  assert.equal(rows[rows.length - 1].p, 1.5);
});

test("times stay in order", () => {
  const rows = chartWindow(
    [
      { t: new Date(now - 30_000).toISOString(), p: 1 },
      { t: new Date(now - 10_000).toISOString(), p: 1.2 },
    ],
    60_000,
    now,
    1.2,
  );
  for (let i = 1; i < rows.length; i += 1) assert.equal(rows[i].ts > rows[i - 1].ts, true);
});

test("older stored swaps stay on the chart when a fresh read arrives", () => {
  const rows = mergeTradeRows(
    [
      { tx_hash: "0x" + "a".repeat(64), created_at: "2026-10-01T00:00:00Z", price: 1 },
      { tx_hash: "0x" + "b".repeat(64), created_at: "2026-10-02T00:00:00Z", price: 2 },
    ],
    [{ tx_hash: "0x" + "b".repeat(64), created_at: "2026-10-02T00:00:00Z", price: 3 }],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].price, 1);
  assert.equal(rows[1].price, 3);
});

test("a wider range starts earlier than a short one", () => {
  const points = [{ t: new Date(now - 30 * 60_000).toISOString(), p: 4 }];
  const five = chartWindow(points, 5 * 60_000, now, 5);
  const day = chartWindow(points, 24 * 60 * 60_000, now, 5);
  assert.equal(day[0].ts < five[0].ts, true);
  assert.equal(five.some((row) => row.ts === now - 30 * 60_000), false);
  assert.equal(day.some((row) => row.ts === now - 30 * 60_000), true);
});
