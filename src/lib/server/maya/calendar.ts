import { znzfTradePath } from "@/lib/token-path";
import { jakartaDayIndex } from "../telegram-posts";

export type ArcDay = {
  day: number;
  name: string;
  job: "A1" | "A3" | "A4" | "A5" | "A6" | "A7";
  intent: string;
  url: string;
  example: string;
};

const trade = () => `https://zenzen.fun${znzfTradePath()}`;

const buy = () =>
  "$ZNZF has a pool.\nYou buy it there.\nYou can sell it back into that same pool.\nBuy $ZNZF.";

export const REPLY_SHAPE = "Yes. You sell it back into the same pool.";

export const ARC: ArcDay[] = [
  { day: 0, name: "Why buy", job: "A6", url: trade(), example: buy(), intent: "Subject is buying $ZNZF and selling it back into the same pool. Your own words. One specific question may end the post. No fee. The last line is that one link." },
  { day: 1, name: "Launch", job: "A4", url: "https://zenzen.fun/launch", example: "Your token can have a pool today.\nYou name it.\nYou pick what it trades against.\nLaunch it.", intent: "Subject is launching a token into its own pool. Your own words. No fee. The last line is that one link." },
  { day: 2, name: "Creator Quest", job: "A6", url: "https://zenzen.fun/airdrop", example: "Launch a token.\nGet 3 real buyers.\nYour token gets a Featured slot and a shoutout.\nStart the quest.", intent: "Sell the quest as a reason to launch. No money, token, or price promise. The last line is that one link." },
  { day: 3, name: "Bridge", job: "A3", url: "https://zenzen.fun/bridge", example: "$ZNZF can sit on the other network.\nYou lock it here.\nThe same amount shows up there.\nMove it.", intent: "Subject is locking $ZNZF and releasing the same amount on the other network. Your own words. The last line is that one link." },
  { day: 4, name: "Stake", job: "A6", url: "https://zenzen.fun/staking", example: "A locked $ZNZF is a vote.\nYou lock it.\nA balance left in the wallet does not vote.\nLock it.", intent: "Subject is locking $ZNZF so it can vote. Your own words. The last line is that one link." },
  { day: 5, name: "Explore", job: "A5", url: "https://zenzen.fun/explore", example: "New pools sit at the top.\nYou open one.\nYou can buy it and sell it back.\nLook first.", intent: "Sell looking at a pool before trading. The last line is that one link." },
  { day: 6, name: "Live ripple", job: "A5", url: "https://zenzen.fun/explore", example: "A new pool shows up when someone launches.\nThe pad does not invent one.\nYou can be the one who does.\nLaunch yours.", intent: "Sell the empty page as an open door. No invented ticker. The last line is that one link." },
  { day: 7, name: "Real buyers", job: "A6", url: "https://zenzen.fun/airdrop", example: "The quest counts real buyers.\nA wallet you funded does not count.\nThree real buyers put your token in Featured.\nCheck yours.", intent: "Explain the anti-sybil rule. No money, token, or price promise. The last line is that one link." },
  { day: 8, name: "Board", job: "A3", url: "https://zenzen.fun/explore", example: "The board shows pools that are already trading.\nOpen it.\nLook before you buy.\nOpen it.", intent: "Send people to the board. No score. The last line is that one link." },
  { day: 9, name: "List", job: "A4", url: "https://zenzen.fun/list", example: "You already have a token.\nYou list the contract you already deployed.\nYou do not deploy a second one.\nList it.", intent: "Sell listing. The last line is that one link." },
  { day: 10, name: "Arc gas", job: "A3", url: "https://zenzen.fun/fund", example: "$ZNZF on Arc needs USDC for gas.\nYou add it to the wallet you connected.\nIt stays in that wallet.\nAdd it.", intent: "Sell the gas top-up. It is not a payment to Zenze. The last line is that one link." },
  { day: 11, name: "Sell back", job: "A7", url: "https://zenzen.fun/guide", example: "You can sell $ZNZF back.\nThe sale goes into the same pool.\nArc is not a second coin.\nSell it back.", intent: "Sell the exit. No fee percent. The last line is that one link." },
  { day: 12, name: "Quest shoutout", job: "A6", url: "https://zenzen.fun/airdrop", example: "Finish the Creator Quest.\n@getzenzen posts your token.\nIt sits in Featured for a week.\nStart it.", intent: "Sell the shoutout. No money, token, or price promise. The last line is that one link." },
  { day: 13, name: "One product", job: "A4", url: "https://zenzen.fun/launch", example: "One product, a token and its pool.\nYou name it.\nThe pool opens when you launch.\nLaunch it.", intent: "Sell the launch again, in four clean lines. The last line is that one link." },
];

export function themeFor(now = new Date()): ArcDay {
  return ARC[jakartaDayIndex(now) % ARC.length]!;
}

export function urlForTheme(theme: ArcDay): string {
  return theme.url;
}
