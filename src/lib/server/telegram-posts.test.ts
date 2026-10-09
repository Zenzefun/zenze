import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { announcementDue, announcementText, announcementsOwed, cleanNote, wibHour } from "./telegram-posts.ts";

describe("telegram slots", () => {
  it("counts a missed morning slot as owed before noon WIB", () => {
    const now = new Date("2026-10-01T04:24:00.000Z");
    assert.equal(wibHour(now), 11);
    assert.equal(announcementsOwed(now), 1);
    assert.equal(announcementDue(0, 0, now), true);
  });

  it("does not send a second announcement inside 45 minutes", () => {
    const now = new Date("2026-10-01T05:10:00.000Z");
    const last = now.getTime() - 20 * 60 * 1000;
    assert.equal(announcementsOwed(now), 2);
    assert.equal(announcementDue(1, last, now), false);
  });

  it("stops at five", () => {
    const now = new Date("2026-10-01T16:30:00.000Z");
    assert.equal(announcementDue(5, 0, now), false);
  });

  it("sends points to /airdrop, never /points", () => {
    const cleaned = cleanNote(
      "Points are now live on Zenze. Your activity becomes progress. See where you stand.\nhttps://zenze.fun/points",
    );
    assert.ok(cleaned);
    assert.match(cleaned, /https:\/\/zenzen\.fun\/airdrop/);
    assert.equal(cleaned.includes("/points"), false);
  });

  it("keeps the link on its own line", () => {
    const text = announcementText(1, "https://zenze.fun/token/0x65ee0ce656908544a1f29856ac9aee8563b5002c");
    const cleaned = cleanNote(text);
    assert.ok(cleaned);
    assert.match(cleaned, /https:\/\/zenzen\.fun\/token\/0x65ee0ce656908544a1f29856ac9aee8563b5002c/);
    assert.match(cleaned, /\n\n/);
    assert.doesNotMatch(cleaned, /\?/);
  });
});
