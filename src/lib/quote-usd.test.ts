import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { usdFromDexPairs, usdFromYahooChart } from "./quote-usd.ts";

describe("usdFromDexPairs", () => {
  it("uses the highest-liquidity pair whose base is the wanted token", () => {
    const nvda = "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec";
    const usdg = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
    const map = usdFromDexPairs(
      [
        {
          priceUsd: "10",
          liquidity: { usd: 100 },
          baseToken: { address: nvda },
        },
        {
          priceUsd: "223.4",
          liquidity: { usd: 50_000 },
          baseToken: { address: nvda },
        },
        {
          priceUsd: "0.59",
          liquidity: { usd: 80_000 },
          baseToken: { address: "0x39dbed3a2bd333467115de45665cc57f813c4571" },
        },
        {
          priceUsd: "1.00",
          liquidity: { usd: 1_000_000 },
          baseToken: { address: "0xdead" },
          quoteToken: { address: usdg },
        },
      ],
      [nvda, "0x39dbed3a2bd333467115de45665cc57f813c4571"],
    );
    assert.equal(map[nvda], 223.4);
    assert.equal(map["0x39dbed3a2bd333467115de45665cc57f813c4571"], 0.59);
    assert.equal(map[usdg], undefined);
  });
});

describe("usdFromYahooChart", () => {
  it("reads regularMarketPrice", () => {
    assert.equal(usdFromYahooChart({ chart: { result: [{ meta: { regularMarketPrice: 222.27 } }] } }), 222.27);
    assert.equal(usdFromYahooChart({ chart: { result: null } }), null);
  });
});
