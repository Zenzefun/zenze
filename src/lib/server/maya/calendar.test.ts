import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { scoreDraft } from "./score.ts";
import { shapePost } from "./shape.ts";

function examples() {
  const src = readFileSync(new URL("./calendar.ts", import.meta.url), "utf8");
  const buy = "$ZNZF has a pool.\nYou buy it there.\nYou can sell it back into that same pool.\nBuy $ZNZF.";
  const quoted = [...src.matchAll(/example: "((?:\\.|[^"\\])*)"/g)].map((match) => JSON.parse(`"${match[1]}"`) as string);
  return [buy, ...quoted];
}

describe("today's post can actually be sent", () => {
  it("every day example passes the same gate Run now uses", () => {
    const rows = examples();
    assert.equal(rows.length, 14);
    for (const example of rows) {
      const text = shapePost(example, "original");
      const scored = scoreDraft(text, {
        facts: "",
        action: "original",
        job: "A6",
        segment: "",
        audience: "",
        mentionedUs: false,
        isOurPost: false,
      });
      assert.equal(scored.ok, true, `${scored.reasons.join(", ")} :: ${text}`);
    }
  });
});
