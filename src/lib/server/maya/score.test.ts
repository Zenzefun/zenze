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
    text: "If the first buyers had a private round, it was not a fair launch.\n\n2% on the curve. 2 ETH locks into Uniswap v4.\n$ZNZF",
    why: "Doctrine plus the live mechanic. No domain.",
  },
  {
    label: "good",
    action: "original",
    text: "The $ZNZF curve is on-chain. Volume today is 0. The fee on that curve is 2%.",
    why: "Honest zero. No fake traction.",
  },
  {
    label: "good",
    action: "original",
    text: "$BABI is live on Zenze, paired with ETH.\n2% curve fee. Graduation is a lock, not a promise.",
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
    text: "Buying $ZNZF earlier means you pay less than the next buyer. You can sell it back into the same pool. The trade takes 2%.",
    why: "The allowed buyer sentence. No profit promise.",
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
    label: "bad",
    action: "original",
    text: "I'd rather ask than pitch. What would you want to know first?",
    why: "The repeated pitch template is what the last posts all used.",
  },
];

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
