import assert from "node:assert/strict";
import test from "node:test";
import { parseUtm, shouldRecordPageviews } from "./attribution.ts";

test("parseUtm extracts and sanitizes", () => {
  const utm = parseUtm("?utm_source=x&utm_medium=post&utm_campaign=showcase1118&utm_content=1500&utm_term=bad<script>");
  assert.equal(utm.source, "x");
  assert.equal(utm.medium, "post");
  assert.equal(utm.campaign, "showcase1118");
  assert.equal(utm.content, "1500");
  assert.equal(utm.term, undefined); // invalid chars
});

test("parseUtm drops javascript and oversize", () => {
  const utm = parseUtm("?utm_source=javascript:alert(1)&utm_campaign=" + "a".repeat(80));
  assert.equal(utm.source, undefined);
  assert.equal(utm.campaign, undefined);
});

test("parseUtm empty is empty", () => {
  assert.deepEqual(parseUtm(""), {});
  assert.deepEqual(parseUtm("?foo=bar"), {});
});

test("shouldRecordPageviews respects DNT", () => {
  if (typeof navigator === "undefined") {
    assert.equal(shouldRecordPageviews(), true);
    return;
  }
  const original = navigator.doNotTrack;
  Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true });
  assert.equal(shouldRecordPageviews(), false);
  Object.defineProperty(navigator, "doNotTrack", { value: original, configurable: true });
  assert.equal(shouldRecordPageviews(), true);
});
