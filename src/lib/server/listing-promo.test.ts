import assert from "node:assert/strict";
import test from "node:test";
import { listingProof, listingRoom, projectHandle } from "../listing-promo.ts";
import { tweetText } from "./maya/shape.ts";

test("handles are names, not links, and our own account is never tagged", () => {
  assert.equal(projectHandle("https://x.com/BunOfficial"), "BunOfficial");
  assert.equal(projectHandle("https://x.com/ZenzeFun"), "");
  assert.equal(projectHandle("not a handle"), "");
});

test("a real pool figure is printed once, and a tiny pool invents nothing", () => {
  assert.equal(listingProof(3_700_000, 0), "The pool already holds $3.7M of liquidity.");
  assert.equal(listingProof(12, 40), "");
  assert.equal(listingProof(0, 0), "");
});

test("Telegram is named without a link", () => {
  const room = tweetText(listingRoom("https://t.me/bunroom"), "reply");
  assert.match(room, /@bunroom/);
  assert.equal(/https?:\/\//i.test(room), false);
  assert.equal(listingRoom(""), "");
});