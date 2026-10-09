import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { closePulse, ensureDoor, launchNeedles, pulseArmed } from "./shape.ts";
import { jakartaDayIndex, jakartaDayStart } from "../telegram-posts.ts";

describe("cadence clocks and doors", () => {
  it("flips the arc at Jakarta midnight, not UTC midnight", () => {
    const before = jakartaDayIndex(new Date("2026-10-04T16:30:00.000Z"));
    const after = jakartaDayIndex(new Date("2026-10-04T17:30:00.000Z"));
    assert.equal(after, before + 1);
    assert.equal(jakartaDayIndex(new Date("2026-10-04T16:30:00.000Z")), jakartaDayIndex(new Date("2026-10-04T16:59:00.000Z")));
  });

  it("counts the Jakarta day from 17:00 UTC", () => {
    assert.equal(jakartaDayStart(new Date("2026-10-04T17:30:00.000Z")).toISOString(), "2026-10-04T17:00:00.000Z");
    assert.equal(jakartaDayStart(new Date("2026-10-04T16:30:00.000Z")).toISOString(), "2026-10-03T17:00:00.000Z");
  });

  it("covers a launch by ticker even when the post cannot contain the address", () => {
    assert.deepEqual(launchNeedles("CASHCAT", "0xabc"), ["$CASHCAT", "0xabc"]);
  });

  it("keeps one zenzen.fun door and rewrites the old domain before scoring", () => {
    const kept = ensureDoor("The pool is the exit.\n\nhttps://zenze.fun/guide", "https://zenzen.fun/airdrop");
    assert.match(kept, /https:\/\/zenzen\.fun\/guide/);
    assert.equal(/zenze\.fun/i.test(kept), false);
    assert.equal((kept.match(/https:\/\//g) ?? []).length, 1);
    const added = ensureDoor("$ZNZF sells back into the same pool.", "https://zenzen.fun/guide");
    assert.match(added, /https:\/\/zenzen\.fun\/guide$/);
    const listing = ensureDoor("$CASHCAT is tradable. The pool already holds $1.51k of liquidity.", "https://zenzen.fun/token/0xabc");
    assert.match(listing, /https:\/\/zenzen\.fun\/token\/0xabc$/);
    assert.equal((ensureDoor(listing, "https://zenzen.fun/token/0xdef").match(/https:\/\//g) ?? []).length, 1);
  });

  it("does not let a like hide an original that is due", () => {
    const like = { skipped: "Liked @web3mamiii." };
    const out = closePulse({
      originalDue: true,
      wrote: false,
      refused: "original: line 1 must name the product, in 12 words or fewer",
      executed: like,
    });
    assert.ok(out && "error" in out);
    if (!out || !("error" in out)) return;
    assert.match(out.error, /line 1 must name the product/);
    assert.match(out.skipped, /Liked @web3mamiii/);
    assert.equal(closePulse({ originalDue: false, wrote: false, refused: "", executed: like }), null);
  });

  it("retries arming unless health says the loop is running", () => {
    assert.equal(pulseArmed(true, { pulse: { running: true } }), true);
    assert.equal(pulseArmed(false, { pulse: { running: true } }), false);
    assert.equal(pulseArmed(true, { pulse: { running: false } }), false);
    assert.equal(pulseArmed(true, null), false);
  });
});
