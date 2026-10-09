import assert from "node:assert/strict";
import test from "node:test";
import { hasDexPool, hasQuotedPool, tokenStatMode, tokenSwapReady } from "./pool.ts";

const bun = {
  id: "0x07ebb29a38fbcb41563817e5e19f2cec619c90d2",
  symbol: "BUN",
  source: "listed" as const,
  curve_address: null,
  dex: { priceNative: 0.00003124 },
};

test("a listed Uniswap pool keeps the swap widget", () => {
  assert.equal(hasQuotedPool(bun), false);
  assert.equal(hasDexPool(bun), true);
  assert.equal(tokenSwapReady(bun), true);
});

test("a listed token with no priced pool does not invent a swap", () => {
  assert.equal(tokenSwapReady({ ...bun, dex: null }), false);
  assert.equal(tokenSwapReady({ ...bun, dex: { priceNative: 0 } }), false);
});

test("a listed pool and a live curve do not share the same stat row", () => {
  assert.equal(tokenStatMode(bun), "listed");
  assert.equal(
    tokenStatMode({
      id: "tok",
      symbol: "CAT",
      source: "launched",
      curve_address: "0x1111111111111111111111111111111111111111",
      graduated: false,
    }),
    "curve",
  );
  assert.equal(tokenStatMode({ ...bun, dex: null }), "none");
});

test("a closed curve swaps again once its Uniswap pool has a price", () => {
  const closed = {
    id: "tok",
    symbol: "CAT",
    source: "launched" as const,
    curve_address: "0x1111111111111111111111111111111111111111",
    graduated: true,
    dex: { priceNative: 0.00002 },
  };
  assert.equal(hasQuotedPool(closed), false);
  assert.equal(hasDexPool(closed), true);
  assert.equal(tokenSwapReady(closed), true);
  assert.equal(tokenStatMode(closed), "listed");
});
test("a live curve still swaps, and a closed curve without a pool does not", () => {
  const curve = {
    id: "tok",
    symbol: "CAT",
    source: "launched" as const,
    curve_address: "0x1111111111111111111111111111111111111111",
    graduated: false,
  };
  assert.equal(tokenSwapReady(curve), true);
  assert.equal(hasDexPool(curve), false);
  assert.equal(tokenSwapReady({ ...curve, graduated: true }), false);
});
