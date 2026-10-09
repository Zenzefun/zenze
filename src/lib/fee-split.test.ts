import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CREATOR_TAX_BPS, TRADE_FEE_BPS } from "./chains.ts";
import {
  boundCreatorTaxDraft,
  capCreatorTaxBps,
  clampCreatorTaxBps,
  commitCreatorTaxDraft,
  creatorTradePct,
  LAUNCH_SNIPE_START_BPS,
  protocolTradePct,
} from "./fee-split.ts";

test("creator share is a slice of the 2% fee, not a second tax", () => {
  assert.equal(TRADE_FEE_BPS, 200);
  assert.equal(DEFAULT_CREATOR_TAX_BPS, 200);
  assert.equal(DEFAULT_CREATOR_TAX_BPS / 100, 2);
  assert.equal(clampCreatorTaxBps(10), 1000);
  assert.equal(clampCreatorTaxBps(50), 1000);
  assert.equal(clampCreatorTaxBps(0), 0);
  assert.equal(creatorTradePct(1000), 0.2);
  assert.equal(protocolTradePct(1000), 1.8);
  assert.equal(creatorTradePct(0), 0);
  assert.equal(protocolTradePct(0), 2);
  assert.equal(creatorTradePct(1000) + protocolTradePct(1000), 2);
  assert.equal(LAUNCH_SNIPE_START_BPS, 9900);
});

test("launch form cannot display a creator share above 10", () => {
  assert.equal(boundCreatorTaxDraft("100"), "10");
  assert.equal(boundCreatorTaxDraft("11"), "10");
  assert.equal(boundCreatorTaxDraft("10.5"), "10");
  assert.equal(boundCreatorTaxDraft("10.01"), "10");
  assert.equal(boundCreatorTaxDraft("10"), "10");
  assert.equal(boundCreatorTaxDraft("10.00"), "10.00");
  assert.equal(boundCreatorTaxDraft("9.25"), "9.25");
  assert.equal(boundCreatorTaxDraft("9.999"), "9.99");
  assert.equal(boundCreatorTaxDraft("0.01"), "0.01");
  assert.equal(boundCreatorTaxDraft("0."), "0.");
  assert.equal(boundCreatorTaxDraft(""), "");
  assert.equal(boundCreatorTaxDraft("-4"), "0");
  assert.equal(boundCreatorTaxDraft("abc"), "");
  assert.equal(commitCreatorTaxDraft("100"), "10");
  assert.equal(commitCreatorTaxDraft(""), "0");
  assert.equal(commitCreatorTaxDraft("9.25"), "9.25");
  assert.equal(commitCreatorTaxDraft("10."), "10");
  assert.equal(capCreatorTaxBps(1000), 1000);
  assert.equal(capCreatorTaxBps(1001), 1000);
  assert.equal(capCreatorTaxBps(Number.NaN), 200);
  assert.equal(capCreatorTaxBps(-3), 0);
});
