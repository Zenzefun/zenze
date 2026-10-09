import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasTruncatedUrl, isMillDump, neutralizeBareDomain, humanSpacing, doorUrl, replyDoor, shapePost, stripTruncatedUrl, tweetText } from "./shape.ts";

describe("shapePost", () => {
  it("strips zenze.fun so X does not hide the post", () => {
    const out = shapePost(
      "If the first buyers had a private round, it was not a fair launch.\n\n2% on the curve. 2 ETH locks into Uniswap v4.\n$ZNZF https://zenze.fun/docs",
    );
    assert.match(out, /fair launch/);
    assert.equal(/zenze\.fun/i.test(out), false);
    assert.match(out, /https:\/\/zenzen\.fun\/docs/);
    assert.ok(out.length <= 240);
  });

  it("drops a truncated URL leftover from the mill slice", () => {
    const out = shapePost(
      "$ZNZF is 1,000,000,000 on Robinhood Chain. ETH 2637.01. 24h vol 0.0001.\nArc is bridged 1:1 — nothing extra is minted.\nht",
    );
    assert.equal(out.includes("ht"), false);
    assert.equal(/https?:\/\/\S*$/.test(out) && !/zenze\.fun/.test(out), false);
  });

  it("never leaves a cut https:// at the end", () => {
    const raw =
      "Governance weight, staking weight, fee-rebate design, buyback-and-burn when operators execute it. That is $ZNZF.\nhttps://zenze.fun/znzf extra padding to force a cut " +
      "xxxx ".repeat(40) +
      "https://zen";
    const out = shapePost(raw);
    assert.equal(/https?:\/\/\s*$/i.test(out), false);
    assert.equal(/https:\/\/zen$/i.test(out), false);
    assert.equal(/zenze\.fun/i.test(out), false);
  });

  it("keeps a complete URL even when the body would overflow 240", () => {
    const body =
      "$ZNZF does four things, and one you can quote: governance weight. 1,000,000,000 canonical on Robinhood Chain, bridged 1:1 to Arc. Staking weight and fee-rebate design follow; buyback-and-burn only when operators actually run it.";
    const out = shapePost(`${body}\n\nhttps://zenze.fun/znzf`);
    assert.match(out, /https:\/\/zenzen\.fun\/znzf/);
    assert.equal(/zenze\.fun/i.test(out), false);
    assert.equal(hasTruncatedUrl(out), false);
    assert.ok(out.length <= 240);
  });

  it("keeps sentences the model already separated", () => {
    const out = shapePost("Buy earlier.\n\nYou pay less.\n\nYou can sell back into the same pool.");
    assert.equal(out, "Buy earlier.\n\nYou pay less.\n\nYou can sell back into the same pool.");
  });

  it("does not restack a paragraph into a four-line slogan", () => {
    const out = shapePost("Your token can have a pool today. You name it. You pick the pair. Launch it.");
    assert.equal(out, "Your token can have a pool today. You name it. You pick the pair. Launch it.");
    assert.equal(out.includes("\n\n"), false);
  });

  it("turns an em dash into a comma and keeps a blank line between sentences", () => {
    assert.equal(
      humanSpacing("Arc is 1:1 — not a second mint.\nThe trade takes 2%."),
      "Arc is 1:1, not a second mint.\n\nThe trade takes 2%.",
    );
    assert.equal(humanSpacing("Done.Next buyer pays more."), "Done. Next buyer pays more.");
    assert.equal(humanSpacing("Supply is 1,000,000,000. $ ZNZF stays that."), "Supply is 1,000,000,000. $ZNZF stays that.");
  });

  it("keeps one zenzen.fun link and drops the rest", () => {
    const out = shapePost("Where? https://x.com/foo/status/1 https://zenze.fun/launch https://linktr.ee/zenzefun", "reply");
    const urls = out.match(/https:\/\/[^\s]+/g) ?? [];
    assert.deepEqual(urls, ["https://zenzen.fun/launch"]);
  });

  it("never leaves /points in a post", () => {
    const out = shapePost("See where you stand.\nhttps://zenze.fun/points");
    assert.equal(out.includes("/points"), false);
    assert.equal(out.includes("zenze.fun"), false);
  });

  it("keeps the new domain on an original and drops Linktree", () => {
    const out = shapePost("A lock is the product.\nhttps://linktr.ee/zenzefun");
    assert.match(out, /https:\/\/zenzen\.fun$/);
    assert.equal(/linktr\.ee/i.test(out), false);
  });

  it("uses one door", () => {
    assert.equal(doorUrl(false), "https://zenzen.fun");
    assert.equal(doorUrl(true), "https://zenzen.fun");
    const reply = shapePost("Where?\nhttps://linktr.ee/zenzefun", "reply");
    assert.equal(replyDoor(reply).includes("https://zenzen.fun"), true);
    assert.equal(/linktr\.ee/i.test(replyDoor(reply)), false);
    assert.equal(replyDoor("Where? https://zenze.fun/airdrop"), "Where? https://zenzen.fun/airdrop");
    assert.match(shapePost("Come through.\nhttps://zenze.fun"), /https:\/\/zenzen\.fun/);
    const both = shapePost("A lock is the product.\nhttps://linktr.ee/zenzefun\nhttps://zenze.fun/staking");
    assert.equal(both.match(/https:\/\/\S+/g)?.join(" "), "https://zenzen.fun/staking");
  });
});

describe("neutralizeBareDomain", () => {
  it("does not leave the bare domain X autolinks as http", () => {
    const out = neutralizeBareDomain("Read Zenze.fun before you sign. http://Zenze.fun/docs and https://www.zenze.fun/znzf");
    assert.equal(out.includes("Zenze.fun"), false);
    assert.equal(out.includes("http://"), false);
    assert.match(out, /Read Zenzen before/);
    assert.match(out, /https:\/\/zenzen\.fun\/docs/);
    assert.match(out, /https:\/\/zenzen\.fun\/znzf/);
  });

  it("shapePost rewrites a bare domain even when a real link is present", () => {
    const out = shapePost("The pool is on Zenze.fun.\nhttps://zenze.fun/znzf");
    assert.equal(out.includes("http://"), false);
    assert.equal(/zenze\.fun/i.test(out), false);
    assert.match(out, /on Zenzen\./);
  });
});

describe("tweetText", () => {
  it("never slices a URL to https:", () => {
    const long =
      "Canonical $ZNZF is governance weight on Robinhood Chain. " +
      "Staking weight and fee-rebate design follow when operators actually run them. ".repeat(4) +
      "https://zenze.fun/znzf";
    const out = tweetText(long);
    assert.equal(/zenze\.fun/i.test(out), false);
    assert.ok(out.length <= 280);
    assert.equal(hasTruncatedUrl(out), false);
  });
});

describe("isMillDump", () => {
  it("flags the old mill fact paste", () => {
    assert.equal(
      isMillDump(
        "$ZNZF is 1,000,000,000 on Robinhood Chain. ETH 2637.01. 24h vol 0.0001.\nArc is bridged 1:1 — nothing extra is minted.",
      ),
      true,
    );
  });

  it("flags ETH print + volume without needing three other hits", () => {
    assert.equal(
      isMillDump("2 pools already swimming. ETH 2664.01 on the tape, 24h vol 0.0016. Launch smart."),
      true,
    );
  });

  it("allows a single supply + bridge pin", () => {
    assert.equal(
      isMillDump(
        "Canonical $ZNZF is 1,000,000,000 on Robinhood Chain. Arc is bridged 1:1 — nothing extra is minted.\nhttps://zenze.fun/znzf",
      ),
      false,
    );
  });
});

describe("stripTruncatedUrl", () => {
  it("keeps a complete zenze path", () => {
    assert.equal(/zenze\.fun/i.test(stripTruncatedUrl("See the pool.\nhttps://zenze.fun/token/0xabc")), false);
  });
});
