import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickChatText, systemForKind, useCapyMemory } from "./ai-text.ts";
import { extractJsonObject } from "./maya/json.ts";

describe("pickChatText", () => {
  it("prefers content over chain-of-thought", () => {
    const text = pickChatText({
      content: '{"pong":true}',
      reasoning_content: "Thinking {not: json} about the plan.",
    });
    assert.equal(text, '{"pong":true}');
    assert.equal(extractJsonObject(text)?.pong, true);
  });

  it("falls back to reasoning only when content is empty", () => {
    assert.equal(pickChatText({ content: "  ", reasoning_content: "Final: stay zen." }), "Final: stay zen.");
  });

  it("does not treat empty content as success", () => {
    assert.equal(pickChatText({ content: "", reasoning_content: "" }), "");
    assert.equal(pickChatText({}), "");
  });

  it("joining reasoning + content would poison JSON extraction", () => {
    const reasoning = "I should emit {strategy: calm, items: []}";
    const content = '{"strategy":"calm","items":[]}';
    const joined = `${content}\n${reasoning}`;
    assert.equal(extractJsonObject(joined), null);
    assert.equal(extractJsonObject(content)?.strategy, "calm");
  });
});

describe("Maya is not Capy", () => {
  const capy = "You are Capy. Sign as Capy. Use 🌿.";
  const maya = "You are Maya Chen. War room. No mill.";

  it("maya kinds get only the operator prompt", () => {
    assert.equal(systemForKind("maya:decide", maya, capy), maya);
    assert.equal(useCapyMemory("maya:decide"), false);
  });

  it("public Capy kinds keep the mascot prompt", () => {
    assert.match(systemForKind("advise", "", capy), /Capy/);
    assert.match(systemForKind("marketing", "Write a tweet.", capy), /Capy/);
    assert.equal(useCapyMemory("marketing"), true);
  });
});
