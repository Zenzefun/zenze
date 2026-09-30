import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatStakeApy, realStakeApy } from "./stake-apy.ts";

describe("realStakeApy", () => {
  it("is 0 when fees are quiet", () => {
    assert.equal(realStakeApy(0, 100_000, 2600, 0.01), 0);
  });

  it("does not quote six-figure APY on dust TVL", () => {
    // 100 ZNZF × $0.00007 = $0.007 against 0.000192 ETH of fees.
    const apy = realStakeApy(0.000192, 100, 2630, 0.00007);
    assert.equal(apy, null);
    assert.equal(formatStakeApy(apy).value, "—");
  });

  it("quotes a real rate once TVL is meaningful", () => {
    // $10k staked, $20 of 7-day fees, 50% to stakers → (20*0.5*52)/10000 = 5.2%
    const apy = realStakeApy(20 / 2600, 1_000_000, 2600, 0.01);
    assert.ok(apy != null);
    assert.ok(Math.abs((apy as number) - 5.2) < 0.05);
    assert.equal(formatStakeApy(apy).quoted, true);
  });
});
