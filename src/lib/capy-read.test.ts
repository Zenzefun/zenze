import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capyRead, spokenMoney } from "./capy-read.ts";

describe("capy read", () => {
  it("says large amounts the way a person would", () => {
    assert.equal(spokenMoney(21_900_000), "$21.9 million");
    assert.equal(spokenMoney(852_000), "$852,000");
    assert.equal(spokenMoney(450_406), "$450,000");
  });

  it("splits the pool into a list and two short sentences", () => {
    const read = capyRead({
      name: "Bundle Cat",
      quote: "ETH",
      priceUsd: 0.00002776 * 2600,
      priceQuote: "0.00002776",
      mcapUsd: 21_900_000,
      poolUsd: 852_000,
      volumeUsd: 450_406,
      holders: 1,
      onUniswap: true,
    });
    assert.equal(read.lines.map((line) => line.label).join(","), "Price,Market cap,In the pool,Traded today,Holders");
    assert.equal(read.lines[0]?.value, "7.2 cents");
    assert.equal(read.lines[0]?.hint, "0.00002776 ETH");
    assert.match(read.note, /Bundle Cat is bought and sold for ETH\. The pool is on Uniswap\./);
    assert.match(read.note, /One wallet holds all of it/);
    assert.doesNotMatch(read.note, /Health|Stormy|quote volume|Capy|trades against|score/);
  });

  it("says when a new pool has not traded", () => {
    const read = capyRead({
      name: "Cutez",
      quote: "ETH",
      priceUsd: null,
      priceQuote: null,
      mcapUsd: null,
      poolUsd: null,
      volumeUsd: 0,
      holders: 0,
      onUniswap: false,
    });
    assert.match(read.note, /still open here/);
    assert.match(read.note, /Nobody has traded it today/);
    assert.equal(read.lines.find((line) => line.label === "Holders")?.value, "None yet");
  });

  it("mentions a small pool only when more than one wallet holds it", () => {
    const read = capyRead({
      name: "Pebble",
      quote: "ETH",
      priceUsd: 1,
      priceQuote: "0.0004",
      mcapUsd: 1_000_000,
      poolUsd: 20_000,
      volumeUsd: 1_000,
      holders: 40,
      onUniswap: true,
    });
    assert.match(read.note, /small next to the market cap/);
    assert.match(read.note, /A lot of wallets hold it/);
  });
});
