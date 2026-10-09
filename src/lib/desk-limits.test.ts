import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deskLimits } from "./desk-limits.ts";

describe("deskLimits", () => {
  it("fills every row, including replies, when the desk has not loaded", () => {
    const rows = deskLimits(null);
    assert.deepEqual(rows.map((row) => row.label), ["Posts", "Minutes between posts", "Likes", "Follows", "Reposts", "Replies"]);
    assert.equal(rows.every((row) => row.value !== ""), true);
    assert.equal(rows.find((row) => row.label === "Replies")?.today, "0 / 12");
  });

  it("shows the saved numbers, not a blank limit", () => {
    const rows = deskLimits({
      today: 0,
      originalCap: 5,
      minutes: 45,
      quotas: {
        like: { done: 2, cap: 8 },
        follow: { done: 0, cap: 20 },
        repost: { done: 0, cap: 3 },
        comment: { done: 0, cap: 5 },
      },
    });
    assert.equal(rows[0]?.today, "0 / 5");
    assert.equal(rows[0]?.value, "5");
    assert.equal(rows[2]?.today, "2 / 8");
    assert.equal(rows[2]?.value, "8");
    assert.equal(rows[5]?.today, "0 / 5");
    assert.equal(rows[5]?.value, "5");
  });
});
