import { znzfTradePath } from "@/lib/token-path";

export type ArcDay = {
  day: number;
  name: string;
  job: "A1" | "A3" | "A4" | "A5" | "A6" | "A7";
  intent: string;
  url: string;
  example: string;
};

const trade = () => `https://zenze.fun${znzfTradePath()}`;

const buy = () =>
  "You buy $ZNZF before the next person. The price you pay is the one on the curve at that moment. Theirs is higher. If you change your mind, you sell back into the same pool. The trade takes 2%.";

export const REPLY_SHAPE =
  "Yes. You sell it back into the same pool. The trade takes 2%. There is no second coin.";

export const ARC: ArcDay[] = [
  { day: 0, name: "Why buy", job: "A6", url: trade(), example: buy(), intent: "Story: you bought before the next person, so you paid less, and you can sell back. The trade takes 2%. No link while X hides the domain." },
  { day: 1, name: "Launch", job: "A4", url: "https://zenze.fun/launch", example: "Someone names a token and chooses who receives the creator share. There is no separate presale. The curve is the launch.", intent: "Story of naming a token. No volume promise. No link while X hides the domain." },
  { day: 2, name: "Points", job: "A6", url: "https://zenze.fun/airdrop", example: "Points are already counting. When the pool opens, it is split by those points. Your point is the same share as anyone else's. Nothing can be claimed before that open.", intent: "Story of points, not a claim. Do not print the point table. No link while X hides the domain." },
  { day: 3, name: "Bridge", job: "A3", url: "https://zenze.fun/bridge", example: "You lock $ZNZF on Robinhood. The same amount shows up on Arc. It is the same coin, not a second one.", intent: "Story of one coin moving. No link while X hides the domain." },
  { day: 4, name: "Stake", job: "A6", url: "https://zenze.fun/staking", example: "You lock $ZNZF. That lock is the vote. A balance sitting in the wallet does not speak.", intent: "Story of a lock that votes. No link while X hides the domain." },
  { day: 5, name: "Explore", job: "A5", url: "https://zenze.fun/explore", example: "The newest pool sits at the top. The first buyer of that pool pays less than the person who arrives after them.", intent: "Story of arriving first on a new pool. No link while X hides the domain." },
  { day: 6, name: "Live ripple", job: "A5", url: "https://zenze.fun/explore", example: "The pad is early. A pool appears when someone actually launches. We do not invent one to fill the page.", intent: "Honest quiet, told as a fact. No invented ticker. No link while X hides the domain." },
  { day: 7, name: "Ask the room", job: "A1", url: "https://zenze.fun/airdrop", example: "If you hold $ZNZF, what made you stay: that you can sell it back, or the price you got in?", intent: "One question. No pitch. No link." },
  { day: 8, name: "Capy", job: "A3", url: "https://zenze.fun/capyai", example: "Before you size a pool, you can ask Capy to read it. The answer runs from calm water to a storm. It will not tell you to buy.", intent: "Story of asking for a read. No score shout. No link while X hides the domain." },
  { day: 9, name: "List", job: "A4", url: "https://zenze.fun/list", example: "You already have a token. You list it. The page reads the contract you already deployed. You do not deploy a second one.", intent: "Story of listing, not redeploying. No link while X hides the domain." },
  { day: 10, name: "Arc gas", job: "A3", url: "https://zenze.fun/fund", example: "Arc charges gas in USDC. You buy that USDC into the wallet you connected. It stays yours. It is not a payment to Zenze.", intent: "Story of gas staying in the wallet. No link while X hides the domain." },
  { day: 11, name: "Objection", job: "A7", url: "https://zenze.fun/guide", example: "The question that keeps coming is can I sell. Yes. Back into the same pool. The trade takes 2%. Arc is not a second coin.", intent: "Answer the objection as a story, not a dunk. No link while X hides the domain." },
  { day: 12, name: "Bring a friend", job: "A6", url: "https://zenze.fun/airdrop", example: "A friend buys $ZNZF. That can add to your points, up to ten friends. The invite shows up after you connect. It is not a code you invent.", intent: "Story of one friend buying. No point table. No link while X hides the domain." },
  { day: 13, name: "Keep or drop", job: "A1", url: trade(), example: "The line people actually answer is not a feature list. You paid less than the next buyer, and you could sell it back.", intent: "Keep the sentence people answered. Drop the rest. No link while X hides the domain." },
];

export function themeFor(now = new Date()): ArcDay {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start) / 86400000);
  return ARC[day % ARC.length]!;
}

export function urlForTheme(theme: ArcDay): string {
  return theme.url;
}
