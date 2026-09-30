import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function quoteFile(key: string): string {
  if (key === "znzf") return "public/brand/capy-mark-64.png";
  if (key === "pons") return "public/quotes/pons.webp";
  if (key === "slv") return "public/quotes/slv.svg";
  return `public/quotes/${key}.png`;
}

describe("quote and chain marks", () => {
  it("gives every pair its own real file, never a shared letter circle", () => {
    const src = readFileSync("src/lib/pairs.ts", "utf8");
    const keys = new Set<string>([
      ...[...src.matchAll(/key: "([a-z0-9]+)"/g)].map((m) => m[1] ?? ""),
      ...[...src.matchAll(/stock\("([A-Z0-9]+)"/g)].map((m) => (m[1] ?? "").toLowerCase()),
    ]);
    keys.delete("");
    const seen = new Map<string, string>();
    for (const key of keys) {
      const bytes = readFileSync(quoteFile(key));
      assert.ok(bytes.length > 400, `${key} logo is too small to be a real mark`);
      assert.equal(bytes.includes(Buffer.from("<text")), false, `${key} is still a letter placeholder`);
      const hash = createHash("sha256").update(bytes).digest("hex");
      assert.equal(seen.get(hash), undefined, `${key} reuses ${seen.get(hash)}`);
      seen.set(hash, key);
    }
    const chain = readFileSync("public/chains/robinhood.jpg");
    const arc = readFileSync("public/chains/arc.svg");
    assert.ok(chain.length > 1000, "Robinhood Chain mark is not the official feather");
    assert.ok(arc.includes("viewBox"), "Arc mark is missing");
    assert.equal(arc.includes("<text"), false);
  });
});
