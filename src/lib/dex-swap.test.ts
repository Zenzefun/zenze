import assert from "node:assert/strict";
import test from "node:test";
import { activeLiquidityUsd, ethPerToken, ethPoolId, sqrtX96AtTick, traderSwap } from "./dex-swap.ts";

test("a pool sending the token out is a buy", () => {
  const row = traderSwap(false, 1_000n, -2_000n);
  assert.deepEqual(row, { side: "buy", token: 2_000n, quote: 1_000n });
});

test("a pool receiving the token is a sell", () => {
  const row = traderSwap(false, -5n, 9n);
  assert.equal(row?.side, "sell");
  assert.equal(row?.token, 9n);
});

test("tick zero is about one ETH per token, and empty liquidity is zero", () => {
  const sqrt = sqrtX96AtTick(0);
  const price = ethPerToken(sqrt, 18);
  assert.ok(Math.abs(price - 1) < 0.02);
  assert.equal(activeLiquidityUsd({ sqrtPriceX96: sqrt, tick: 0, tickSpacing: 60, liquidity: 0n, tokenDecimals: 18, ethUsd: 3000 }), 0);
  assert.ok(Math.abs(ethPerToken(1n << 96n, 18) - 1) < 1e-9);
  assert.equal(ethPerToken(0n, 18), 0);
  assert.equal(ethPoolId("0x07ebb29a38fbcb41563817e5e19f2cec619c90d2", 3000, 60).length, 66);
  const usd = activeLiquidityUsd({
    sqrtPriceX96: sqrtX96AtTick(30),
    tick: 30,
    tickSpacing: 60,
    liquidity: 10n ** 18n,
    tokenDecimals: 18,
    ethUsd: 3000,
  });
  assert.ok(usd > 0);
});
