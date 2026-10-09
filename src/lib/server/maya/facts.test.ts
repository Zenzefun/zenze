import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plannerFacts } from "./facts.ts";

describe("plannerFacts", () => {
  const base = {
    launched: 1,
    graduated: 0,
    volumeNative: 0.0001,
    curveFeePct: 2,
    graduationEth: 2,
    lastPosts: [
      "$ZNZF is 1,000,000,000 on Robinhood Chain. ETH 2681.66. 24h vol 0.0001. Arc is bridged 1:1.",
      "If the first buyers had a private round, it was not a fair launch. https://zenze.fun/docs",
    ],
    tokenLines: ["$BABI on robinhood pair BABI/ETH · holders 0 · health 40"],
    newestLaunch: null as { symbol: string; name: string } | null,
    themeName: "Distributor day",
    themeIntent: "Give $ZNZF holders something true they can quote.",
    themeJob: "A6",
    themeUrl: "https://zenzen.fun/znzf",
  };

  it("does not hand Maya a pasteable ETH/USD or dust volume print", () => {
    const text = plannerFacts(base);
    assert.equal(/ETH\/USD\s*:/i.test(text), false);
    assert.equal(/\beth\s+\d{3,}/i.test(text.replace(/DEAD MILL[\s\S]*?(?:\n|$)/g, "")), false);
    assert.match(text, /quiet \(do not paste the raw number\)/);
    assert.match(text, /End an original with one link/);
    assert.match(text, /https:\/\/zenzen\.fun\/znzf/);
    assert.equal(/zenze\.fun/i.test(text.replace(/DEAD MILL[\s\S]*?(?:\n|$)/g, "")), false);
    assert.match(text, /points share it/);
    assert.match(text, /Not a second coin/);
    assert.match(text, /Weekly rival tape/);
    assert.match(text, /Never paste a rival number/);
  });

  it("labels mill last-posts as dead so they are not copied", () => {
    const text = plannerFacts(base);
    assert.match(text, /DEAD MILL \(do not copy\)/);
    assert.match(text, /fair launch/);
  });
});
