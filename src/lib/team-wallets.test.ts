import assert from "node:assert/strict";
import test from "node:test";
import { isCommunityLaunch, isTeamWallet } from "./team-wallets.ts";

test("team wallets match allowlist (case-insensitive)", () => {
  assert.equal(isTeamWallet("0x6878719902a11148815e521fead2d2c9fa81dacc"), true);
  assert.equal(isTeamWallet("0x6878719902A11148815E521FEAD2D2C9FA81DACC"), true);
  assert.equal(isTeamWallet("0x426B74d42607aE5484909dAbFD3dEb76Db480f8e"), true);
  assert.equal(isTeamWallet("0xed43c2daf601c14b1053c57a5dfe4971b7b0fc58"), true);
  assert.equal(isTeamWallet("0x1111111111111111111111111111111111111111"), false);
  assert.equal(isTeamWallet(null), false);
});

test("community launch excludes listed, protocol, and team", () => {
  assert.equal(isCommunityLaunch({ source: "launched", creator_wallet: "0xabc", symbol: "MEME" }), true);
  assert.equal(isCommunityLaunch({ source: "listed", creator_wallet: "0xabc", symbol: "MEME" }), false);
  assert.equal(isCommunityLaunch({ source: "launched", creator_wallet: "0x6878719902a11148815e521fead2d2c9fa81dacc", symbol: "SEED" }), false);
  assert.equal(isCommunityLaunch({ source: "launched", creator_wallet: "0xabc", symbol: "ZNZF" }), false);
});
