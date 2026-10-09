import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { brandToxic, scoreDraft } from "./score.ts";

const facts = `Pools launched (ex $ZNZF): 1
ETH/USD: 4200
24h volume (native): 0
Curve fee: 2%
ETH graduation: 2 ETH → Uniswap v4
$ZNZF canonical: 1000000000 on Robinhood. Arc supply 0. Curve fee 2%. No migration.
Buyer sentence: buying earlier means you pay less than the next buyer.
Site: https://zenze.fun
$BABI on robinhood pair BABI/ETH · holders 0 · health 40`;

type Label = "good" | "bad" | "toxic";

const EVAL: { label: Label; action: "original" | "reply" | "quote"; text: string; why: string }[] = [
  {
    label: "good",
    action: "original",
    text: "A token with no private round.\n\nThe curve is the launch.\n\nYou can sell it back.\n\nLaunch it.",
    why: "Doctrine plus the live mechanic. No domain.",
  },
  {
    label: "good",
    action: "original",
    text: "The $ZNZF pool is early.\n\nVolume today is quiet.\n\nYou can still buy it.\n\nBuy $ZNZF.",
    why: "Honest zero. No fake traction.",
  },
  {
    label: "good",
    action: "original",
    text: "$BABI has a pool.\n\nIt is paired with ETH.\n\nYou can sell it back.\n\nLook first.",
    why: "Product moment without a profit promise.",
  },
  {
    label: "good",
    action: "reply",
    text: "Fee is 2% on the live $ZNZF curve and on new curves. The live curve does not migrate. New ETH pairs can graduate at 2 ETH into Uniswap v4.",
    why: "Answers a fee question. No dump link required.",
  },
  {
    label: "good",
    action: "original",
    text: "$ZNZF has a pool.\n\nYou can sell it back.\n\nThe pool sets the price.\n\nBuy $ZNZF.",
    why: "The allowed buy frame. No price ladder and no profit promise.",
  },
  {
    label: "toxic",
    action: "original",
    text: "Buy $ZNZF now. You will profit. https://zenze.fun/znzf",
    why: "A profit promise is not the buyer sentence.",
  },
  {
    label: "toxic",
    action: "original",
    text: "Canonical $ZNZF is the official partnership of Robinhood. Buy now before it graduates.",
    why: "Partnership and graduation promises stay blocked.",
  },
  {
    label: "bad",
    action: "original",
    text: "@OscarDefii Glad you're here. What are you building?",
    why: "An original that opens with @ is shown only to mutuals.",
  },
  {
    label: "good",
    action: "original",
    text: "$ZNZF has a pool. You can sell it back into that same pool. Which side do you use first?",
    why: "One specific question can follow the fact.",
  },
  {
    label: "bad",
    action: "original",
    text: "Which pool do you open first? $ZNZF has a pool.",
    why: "The first sentence cannot be the question.",
  },
  {
    label: "bad",
    action: "original",
    text: "$ZNZF has a pool. What is the one ticker you would list next?",
    why: "A ticker question is a template.",
  },
  {
    label: "bad",
    action: "original",
    text: "Your token can have a pool.\n\nYou choose who receives your slice of the 2% fee.\n\nLaunch it.",
    why: "Fee math does not belong in a post.",
  },
  {
    label: "good",
    action: "original",
    text: "$CASHCAT is listed. You can swap that same pool, and their account sits next to it so you do not have to hunt.",
    why: "A short first sentence can sit in a longer paragraph.",
  },
  {
    label: "bad",
    action: "original",
    text: "$CASHCAT showed up with a pool that anyone can swap against today now.",
    why: "The first sentence itself is over 12 words.",
  },
];

describe("a reply to a person", () => {
  it("allows one zenzen.fun link and rejects the old domain", () => {
    const old = scoreDraft("The pool is here.\n\nhttps://zenze.fun", { facts: "", action: "reply", mentionedUs: true });
    const original = scoreDraft("The pool is here.\n\nhttps://zenzen.fun", { facts, action: "original", job: "A6", segment: "holders", audience: "$ZNZF holders" });
    assert.equal(old.ok, false);
    assert.equal(original.ok, true, original.reasons.join(", "));
  });

  it("can be plain words, without a segment or a slogan", () => {
    const res = scoreDraft("Zenze is where a token gets its own pool the day you launch it. You can sell it back into that same pool.", {
      facts: "",
      action: "reply",
      job: "A1",
      segment: "",
      audience: "",
      mentionedUs: true,
      isOurPost: false,
    });
    assert.equal(res.ok, true, res.reasons.join(", "));
  });
});

describe("scoreDraft", () => {
  for (const row of EVAL) {
    it(row.why, () => {
      const res = scoreDraft(row.text, {
        facts,
        action: row.action,
        job: "A6",
        segment: "holders",
        audience: "$ZNZF holders",
      });
      if (row.label === "good") assert.equal(res.ok, true, res.reasons.join(", "));
      if (row.label === "toxic") assert.equal(brandToxic(row.text), true);
      if (row.label === "bad") assert.equal(res.ok, false, res.reasons.join(", "));
    });
  }
});
