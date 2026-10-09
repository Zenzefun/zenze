export type CapyLine = { label: string; value: string; hint?: string };

export type CapyFacts = {
  name: string;
  quote: string;
  priceUsd: number | null;
  priceQuote: string | null;
  mcapUsd: number | null;
  poolUsd: number | null;
  volumeUsd: number | null;
  holders: number;
  onUniswap: boolean;
};

function smallMoney(n: number): string {
  if (n >= 100) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  if (n === 0) return "$0";
  return `$${n.toFixed(8)}`;
}

/** Round money the way a person says it: $21.9 million, not 21906432.11. */
export function spokenMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${trim1(abs / 1_000_000_000)} billion`;
  if (abs >= 1_000_000) return `$${trim1(abs / 1_000_000)} million`;
  if (abs >= 10_000) return `$${(Math.round(abs / 1000) * 1000).toLocaleString("en-US")}`;
  return smallMoney(abs);
}

function spokenPrice(n: number): string {
  if (n >= 1 || n < 0.01) return spokenMoney(n);
  const cents = n * 100;
  const body = trim1(cents);
  return `${body} ${body === "1" ? "cent" : "cents"}`;
}

function trim1(n: number): string {
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function capyRead(facts: CapyFacts): { lines: CapyLine[]; note: string } {
  const usd = facts.priceUsd != null && facts.priceUsd > 0 ? spokenPrice(facts.priceUsd) : null;
  const quotePx = facts.priceQuote ? `${facts.priceQuote} ${facts.quote}` : null;
  const lines: CapyLine[] = [];
  if (usd || quotePx) {
    lines.push({
      label: "Price",
      value: usd || quotePx || "",
      ...(usd && quotePx ? { hint: quotePx } : {}),
    });
  }
  if (facts.mcapUsd != null && facts.mcapUsd > 0) lines.push({ label: "Market cap", value: spokenMoney(facts.mcapUsd) });
  if (facts.poolUsd != null && facts.poolUsd > 0) lines.push({ label: "In the pool", value: spokenMoney(facts.poolUsd) });
  lines.push({
    label: "Traded today",
    value: facts.volumeUsd != null && facts.volumeUsd > 0 ? spokenMoney(facts.volumeUsd) : "None",
  });
  lines.push({
    label: "Holders",
    value: facts.holders > 0 ? facts.holders.toLocaleString("en-US") : "None yet",
  });

  const where = facts.onUniswap
    ? `${facts.name} is bought and sold for ${facts.quote}. The pool is on Uniswap.`
    : `${facts.name} is bought and sold for ${facts.quote}. The pool is still open here.`;
  const hold =
    facts.holders <= 0
      ? "No wallet holds it yet."
      : facts.holders === 1
        ? "One wallet holds all of it, so one trade can move the price."
        : facts.holders < 20
          ? `Only ${facts.holders} wallets hold it.`
          : "A lot of wallets hold it.";
  const thin =
    facts.holders !== 1 &&
    facts.poolUsd != null &&
    facts.mcapUsd != null &&
    facts.poolUsd > 0 &&
    facts.mcapUsd > 0 &&
    facts.poolUsd / facts.mcapUsd < 0.05
      ? " The pool is small next to the market cap, so a big trade moves the price."
      : "";
  const traded = facts.volumeUsd != null && facts.volumeUsd > 0 ? "" : " Nobody has traded it today.";
  return { lines, note: `${where} ${hold}${thin}${traded}` };
}
