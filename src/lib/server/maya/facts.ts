/** Facts Maya may use. A pasteable wall was the mill. This is pick-one. */

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
  themeExample?: string;
};

export function plannerFacts(input: PlannerFactsInput): string {
  const early = input.launched <= 1 || input.volumeNative < 0.01;
  const last = input.lastPosts.slice(0, 4).map((p) => {
    const line = p.replace(/\s+/g, " ").slice(0, 140);
    if (isMillDump(p)) return `DEAD MILL (do not copy): ${line}`;
    return line;
  });
  const tokens = input.tokenLines
    .slice(0, 4)
    .map((t) => t.replace(/\s+/g, " ").slice(0, 100))
    .filter((t) => !/holders 0 · health/i.test(t) || input.launched > 0);

  return `Today's arc: ${input.themeName} — ${input.themeIntent} (job ${input.themeJob})
Preferred URL this hour: ${input.themeUrl}
${input.themeExample ? `Story shape for today. Retell it. Do not paste it if a recent post already said it. No URL in the original:\n${input.themeExample}\n` : ""}

PICK AT MOST ONE live figure. Prefer a mechanic over a print. Never paste this list.

Mechanics (always true):
- Buyer sentence, only on a Why buy day: buying $ZNZF earlier means you pay less than the next buyer, and you can sell it back into the same pool. The trade takes 2%. Do not add profit, a price target, or "buy now".
- Products you may name, one per post: buy $ZNZF, launch, list, explore, bridge, stake, points, a friend who buys, Arc gas in USDC, Capy.
- Points count now. When the pool opens, those points share it. One point is the same share. Do not print the point table. A friend who buys $ZNZF can add points, up to ten. The invite is on the points page after they connect.
- Bridge locks $ZNZF on Robinhood and releases the same amount on Arc. Not a second coin.
- Stake: the lock is the vote. A balance that is not locked does not speak.
- Arc gas is USDC and it stays in the buyer's wallet. It is not a payment to Zenze.
- The public $ZNZF curve was seeded with 800,000,000. The treasury wallet holds 200,000,000. That is the allocation. There is no separate presale.
- New-curve fee ${input.curveFeePct}%. A new ETH pair can graduate at ${input.graduationEth} ETH into Uniswap v4. The live $ZNZF curve does not migrate.
- Canonical $ZNZF lives on Robinhood Chain. Do not stack supply + bridge + fee + volume in one post.

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
