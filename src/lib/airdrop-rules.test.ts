import assert from "node:assert/strict";
import test from "node:test";
import { MIN_HOLD, PARTS, maxPoints, pointTotal, rulesFromDesk, shareWei, spinFromRoll, UNIT } from "./airdrop-rules.ts";

test("points stay at zero until the wallet has bought $ZNZF", () => {
  const points = pointTotal({
    bought: false,
    telegram: true,
    xFollow: true,
    launched: true,
    seen: true,
    referrals: 10,
    spinPoints: 30,
  });
  assert.equal(points, 0);
});

test("a bigger crowd makes the same points a smaller share", () => {
  const pool = 1_000n * UNIT;
  assert.equal(shareWei(10n, 100n, pool), 100n * UNIT);
  assert.equal(shareWei(10n, 200n, pool), 50n * UNIT);
  assert.equal(maxPoints(), PARTS.buy + PARTS.telegram + PARTS.x + PARTS.launch + PARTS.seen + PARTS.referral * 10 + 30);
});

test("the pool is split by points, not by a fixed token amount", () => {
  const pool = 50_000_000n * UNIT;
  assert.equal(shareWei(20n, 100n, pool), 10_000_000n * UNIT);
  assert.equal(shareWei(80n, 100n, pool), 40_000_000n * UNIT);
  assert.equal(shareWei(20n, 100n, pool) + shareWei(80n, 100n, pool), pool);
  assert.equal(shareWei(0n, 100n, pool), 0n);
});

test("referrals stop at ten and the spin stays inside its slice", () => {
  const points = pointTotal({
    bought: true,
    telegram: false,
    xFollow: false,
    launched: false,
    seen: false,
    referrals: 40,
    spinPoints: 9_000,
  });
  assert.equal(points, PARTS.buy + PARTS.referral * 10 + 30);
  assert.equal(spinFromRoll(0).points, 5);
  assert.equal(spinFromRoll(49).points, 5);
  assert.equal(spinFromRoll(50).points, 10);
  assert.equal(spinFromRoll(79).points, 10);
  assert.equal(spinFromRoll(80).points, 20);
  assert.equal(spinFromRoll(94).points, 20);
  assert.equal(spinFromRoll(95).points, 30);
  assert.equal(spinFromRoll(99).points, 30);
  assert.equal(MIN_HOLD, 10_000n * UNIT);
});

test("a schedule the desk saves has to keep spin chances at 100", () => {
  const rules = rulesFromDesk({
    buy: 20,
    telegram: 5,
    x: 5,
    launch: 8,
    seen: 4,
    referral: 5,
    referralMax: 10,
    minHold: 10_000,
    spin: [
      { points: 5, weight: 40 },
      { points: 10, weight: 30 },
    ],
  });
  assert.equal(rules, null);
});
