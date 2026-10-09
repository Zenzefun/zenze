import assert from "node:assert/strict";
import test from "node:test";
import { applyPayPick, applyReceivePick, flipSwapLegs, isZnzfAsset, pageLegLocks, type SwapLeg } from "./swap-legs.ts";

const eth: SwapLeg = { graphId: "native:robinhood", symbol: "ETH", native: true };
const znzf: SwapLeg = { graphId: "addr:znzf", symbol: "ZNZF", tokenId: "znzf" };
const bun: SwapLeg = { graphId: "addr:bun", symbol: "BUN", tokenId: "list-bun" };
const usdc: SwapLeg = { graphId: "addr:usdc", symbol: "USDG" };

test("$ZNZF is recognized with or without the dollar sign", () => {
  assert.equal(isZnzfAsset(znzf), true);
  assert.equal(isZnzfAsset({ symbol: "$ZNZF" }), true);
  assert.equal(isZnzfAsset(bun), false);
});

test("buying the page token locks that leg and a sell pays ETH only", () => {
  assert.deepEqual(pageLegLocks(eth, znzf, znzf), { payLocked: false, receiveLocked: true });
  assert.deepEqual(pageLegLocks(znzf, eth, znzf), { payLocked: true, receiveLocked: true });
  assert.deepEqual(pageLegLocks(eth, bun, bun), { payLocked: false, receiveLocked: true });
  assert.deepEqual(pageLegLocks(bun, eth, bun), { payLocked: true, receiveLocked: true });
  assert.deepEqual(pageLegLocks(usdc, bun, bun), { payLocked: false, receiveLocked: true });
});

test("flipping a buy of the page token sells for ETH, not the previous pay token", () => {
  assert.deepEqual(flipSwapLegs(usdc, znzf, eth, znzf), { pay: znzf, receive: eth });
  assert.deepEqual(flipSwapLegs(znzf, eth, eth, znzf), { pay: eth, receive: znzf });
  assert.deepEqual(flipSwapLegs(usdc, bun, eth, bun), { pay: bun, receive: eth });
  assert.deepEqual(flipSwapLegs(bun, eth, eth, bun), { pay: eth, receive: bun });
});

test("the locked page token does not move, and another pay token can", () => {
  assert.deepEqual(applyPayPick(usdc, eth, bun, eth, bun), { pay: usdc, receive: bun });
  assert.deepEqual(applyPayPick(bun, usdc, bun, eth, bun), { pay: bun, receive: eth });
  assert.deepEqual(applyPayPick(usdc, bun, eth, eth, bun), { pay: bun, receive: eth });
  assert.deepEqual(applyReceivePick(usdc, eth, bun, eth, bun), { pay: eth, receive: bun });
  assert.deepEqual(applyReceivePick(usdc, eth, znzf, eth, znzf), { pay: eth, receive: znzf });
  assert.deepEqual(applyPayPick(znzf, eth, znzf, eth, znzf), { pay: znzf, receive: eth });
});
