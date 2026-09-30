import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject } from "./json.ts";
import { parsePlan } from "./plan.ts";

describe("maya planner JSON", () => {
  it("strips trailing commas and smart quotes", () => {
    const obj = extractJsonObject(`{ “strategy”: “calm”, “items”: [], }`);
    assert.equal(obj?.strategy, "calm");
    assert.ok(Array.isArray(obj?.items));
  });

  it("parses a real plan and drops skip items", () => {
    const plan = parsePlan(`{
      "strategy": "Talk to launchers. Do not fake volume.",
      "bottleneck": "No organic river.",
      "note": "Believed we needed likes. We did not.",
      "items": [
        {"action":"skip","job":"A1","risk":"low"},
        {
          "action":"original",
          "job":"A4",
          "risk":"low",
          "segment":"launchers",
          "audience":"founders mid-deploy",
          "reason":"arc day",
          "draft":"No presale. The curve is the sale.\\n$ZNZF https://zenze.fun/launch",
          "cta":"deep_link"
        }
      ]
    }`);
    assert.ok(plan);
    assert.equal(plan!.items.length, 1);
    assert.equal(plan!.items[0]?.job, "A4");
    assert.equal(plan!.items[0]?.segment, "launchers");
    assert.equal(plan!.bottleneck, "No organic river.");
  });

  it("parses content JSON even when chain-of-thought also has braces", () => {
    const content = '{"strategy":"calm","bottleneck":"quiet river","items":[]}';
    const reasoning = "I should emit {strategy: calm, items: []}";
    assert.equal(extractJsonObject(`${content}\n${reasoning}`), null);
    const plan = parsePlan(content);
    assert.ok(plan);
    assert.equal(plan!.bottleneck, "quiet river");
  });
});
