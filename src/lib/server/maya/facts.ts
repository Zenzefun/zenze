/** Facts Maya may use. A pasteable wall was the mill. This is pick-one. */

import { auditBrief } from "./audit.ts";
import { isMillDump } from "./shape.ts";

export type PlannerFactsInput = {
  launched: number;
  graduated: number;
  volumeNative: number;
  curveFeePct: number;
  graduationEth: number;
  lastPosts: string[];
  tokenLines: string[];
  newestLaunch: { symbol: string; name: string } | null;
  themeName: string;
  themeIntent: string;
  themeJob: string;
  themeUrl: string;
};

export function plannerFacts(input: PlannerFactsInput): string {
  const early = input.launched <= 1 || input.volumeNative < 0.01;
  const last = input.lastPosts.slice(0, 4).map((p) => {
    const line = p
      .replace(/https?:\/\/(?:www\.)?zenze[n]?\.fun\S*/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    if (!line) return "";
    if (isMillDump(p)) return `DEAD MILL (do not copy): ${line}`;
    return line;
  }).filter(Boolean);
  const tokens = input.tokenLines
    .slice(0, 4)
    .map((t) => t.replace(/\s+/g, " ").slice(0, 100))
    .filter((t) => !/holders 0 · health/i.test(t) || input.launched > 0);

  return `Today's subject: ${input.themeName} — ${input.themeIntent} (job ${input.themeJob})
End an original with one link, on its own line: ${input.themeUrl}
A reply adds that same link only if they asked where. Never write another site.
Write the post yourself. Two or three sentences. The second sentence is why a person stays. Do not use a four-line slogan. Do not copy a sample line.

${auditBrief()}

PICK AT MOST ONE live figure. Prefer a mechanic over a print. Never paste this list.

Mechanics, pick one. Do not paste this list. Do not add a number that is not in Live.
- You can buy $ZNZF and sell it back into the same pool. Do not explain the price. Do not add a percent.
- Points count now. When the pool opens, those points share it.
- A lock here releases the same amount on the other network. Not a second coin.
- A locked $ZNZF is a vote. A balance that is not locked does not speak.
- USDC added for Arc gas stays in that wallet. It is not a payment to Zenze.
- There is no separate presale. Do not mention a fee.

Live (honest):
- Community pools launched: ${input.launched}${early ? " — product is early. Say that. Do not print dust volume." : ""}
- Graduated: ${input.graduated}
- 24h native volume: ${early ? "quiet (do not paste the raw number)" : String(input.volumeNative)}
${input.newestLaunch ? `- Unposted launch: $${input.newestLaunch.symbol} (${input.newestLaunch.name}). Product moment. Do not tell anyone to buy it.` : "- No unposted launch this window."}
${tokens.length ? `Recent pools:\n${tokens.map((t) => `- ${t}`).join("\n")}` : "- No community launches to name."}

Forbidden in one post: ETH price prints, "on the tape", raw 24h vol dust, stacking 1B supply with the Arc bridge and a fee, contract addresses.

Recent own posts:
${last.join("\n") || "(none)"}`;
}
