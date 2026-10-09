import assert from "node:assert/strict";
import test from "node:test";
import { RESIDENT_DAY, seatCopy } from "./seat.ts";

const day = 86_400_000;

test("no trade means no seat", () => {
  const seat = seatCopy(null, 1_000);
  assert.equal(seat.title, "No seat yet");
  assert.equal(seat.days, 0);
});

test("day 30 is the resident mark", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  const young = seatCopy(new Date(now - 6 * day).toISOString(), now);
  const staying = seatCopy(new Date(now - 12 * day).toISOString(), now);
  const resident = seatCopy(new Date(now - RESIDENT_DAY * day).toISOString(), now);
  assert.equal(young.title, "New");
  assert.equal(staying.title, "Staying");
  assert.match(staying.line, /12 of 30/);
  assert.equal(resident.title, "Resident");
  assert.equal(resident.days, 30);
});
