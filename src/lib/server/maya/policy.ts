export const NORTH_STAR =
  "One product. The first sentence is a fact someone could copy, twelve words or fewer, and it names the product. One more sentence may follow. Then one specific question a person can answer. No story. No fee math. One zenzen.fun link at the end. No template question.";

export type MayaJob = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8";
export type MayaRisk = "low" | "medium" | "high";
export type MayaActionKind = "original" | "quote" | "reply" | "follow" | "like" | "repost" | "skip";
export type MayaCta = "none" | "question" | "deep_link";

export const JOBS: Record<MayaJob, string> = {
  A1: "Awareness in the right room",
  A2: "Relationship with a launcher / trader / builder / amplifier",
  A3: "A reply when someone asks where. The only door is the Linktree.",
  A4: "Launch or list a project on Zenze",
  A5: "Trade / deepen a live pool",
  A6: "$ZNZF hold, stake, or governance use",
  A7: "Defend or sharpen brand in a live argument",
  A8: "Learn: language, objections, competitors",
};

export type Segment = {
  id: string;
  name: string;
  pains: string[];
  phrases: string[];
  formats: string[];
  proof: string;
  never: string[];
};

export const SEGMENTS: Segment[] = [
  {
    id: "launchers",
    name: "Fair-launch creators tired of insider pads",
    pains: ["presale allocations", "sniper taxes framed as protection", "team wallets dumping the curve"],
    phrases: ["fair launch", "no presale", "bonding curve", "which pad", "got sniped"],
    formats: ["1-line doctrine", "before/after extractive vs fair", "live product moment"],
    proof: "You name a token and launch it. There is no separate presale. You can sell back into the same pool. The fee rules are in the docs.",
    never: ["guaranteed volume", "we will shill your ticker", "free boost"],
  },
  {
    id: "traders",
    name: "Curve traders who want a cleaner tape",
    pains: ["hidden team supply", "fake graduation", "can't pair into stocks / USDG"],
    phrases: ["bonding curve", "graduate", "sniper", "entry"],
    formats: ["live ripples", "mechanic one-liners", "Capy health label when asked"],
    proof: "On a new pool you can buy and sell back into the same pool. A new ETH pair can lock into Uniswap v4 at 2 ETH. The live $ZNZF pool does not. The rest is in the docs.",
    never: ["buy this ticker", "can't go down", "stealth gem"],
  },
  {
    id: "builders",
    name: "Devs on or next to Robinhood Chain and Arc",
    pains: ["which factory", "how fees split", "bridge mint confusion"],
    phrases: ["Robinhood Chain", "Arc", "factory", "Uniswap v4", "stock token"],
    formats: ["5–8 tweet mechanic threads", "docs deep links"],
    proof: "Canonical $ZNZF 1B on Robinhood. Arc is bridged 1:1 — not a second mint. Factory is on-chain.",
    never: ["we are the official Robinhood pad", "partnership with Uniswap Labs"],
  },
  {
    id: "explainers",
    name: "Crypto-native operators who explain pads",
    pains: ["need a true mechanic they can quote without looking dumb"],
    phrases: ["how the pad works", "fee split", "locked LP"],
    formats: ["quote with a missing frame", "doctrine they can steal"],
    proof: "2% on every curve. A new launch’s creator slice is at most 10% of that fee, not a second tax. The live $ZNZF curve has no creator slice and does not migrate. New ETH pairs can graduate at 2 ETH into Uniswap v4.",
    never: ["collab??", "gm rt this"],
  },
  {
    id: "aesthetic",
    name: "Design / brand accounts who notice the onsen",
    pains: ["every pad looks like a casino landing"],
    phrases: ["brand", "mascot", "calm", "capy"],
    formats: ["quiet visual + one true line", "Capy used sparingly"],
    proof: "The room is quiet on purpose. One true line, then stop.",
    never: ["capy begs", "wen merch"],
  },
  {
    id: "holders",
    name: "Existing $ZNZF holders and early users",
    pains: ["what does the token actually do", "is staking real"],
    phrases: ["$ZNZF", "stake", "fee share", "burn"],
    formats: ["utility facts", "invite them to distribute, not to cheerlead"],
    proof: "Governance weight is the locked stake. You can sell $ZNZF back into the same pool. There is no live rebate. The fee is in the docs.",
    never: ["APY we made up", "burn tomorrow (undated)"],
  },
];

export type Competitor = {
  id: string;
  chain: "robinhood" | "arc" | "other";
  stance: string;
  never: string;
};

export const COMPETITORS: Competitor[] = [
  {
    id: "par.family",
    chain: "robinhood",
    stance:
      "Week of 26 Sep 2026: the posts that traveled opened with a true count or a product result, often under an image. Multi-pair and fee-to-a-handle are their product, not ours.",
    never: "Do not paste 1,170, 1,510, or 100,000,000. Do not claim their volume.",
  },
  {
    id: "PONS / pons.family",
    chain: "robinhood",
    stance:
      "Incumbent volume. No bonding curve — pool live from block one, 1% fee. Speed and fee capture, not a curve. Do not dunk. Contrast: Zenze curves charge 2%. New factory curves can migrate after they fill. The live $ZNZF curve does not migrate.",
    never: "Do not claim we out-earn them. Do not fake our volume against theirs.",
  },
  {
    id: "Pools.trade",
    chain: "robinhood",
    stance:
      "Uniswap Labs. Crowd Launch / Instant Launch, 0.25% LP fee, v4 lock. Brand gravity we do not have. Contrast: we pair into stock tokens and $ZNZF.",
    never: "Do not claim a Uniswap or Labs partnership.",
  },
  {
    id: "hood.fun",
    chain: "robinhood",
    stance:
      "Closest analog: fair bonding curve → locked Uniswap v3. Contrast: a new Zenze ETH pair can lock into Uniswap v4. The live $ZNZF curve does not. We also pair stock tokens and $ZNZF. Our fee is 2%, and the creator slice is at most 10% of that fee.",
    never: "Do not copy their 'fees for life' line.",
  },
  {
    id: "Flap.sh / Bankr / Bags / CASHCAT pad",
    chain: "robinhood",
    stance: "Other permissionless pads. Treat as category weather, not nemeses.",
    never: "No named pile-on without a product truth.",
  },
  {
    id: "Noxa",
    chain: "robinhood",
    stance: "Collapsed July 2026. Cautionary tale, not a punchline about dead users.",
    never: "No grave-dancing.",
  },
  {
    id: "ARCLaunch / Tolly / Warp",
    chain: "arc",
    stance: "Arc pads are early. Zenze locks canonical $ZNZF on Robinhood and releases the existing Arc token 1:1. Arc supply equals completed locks.",
    never: "No 'Arc has no pads' if that stops being true. Check live facts.",
  },
  {
    id: "pump.fun and extractive Solana pads",
    chain: "other",
    stance: "Category enemy is insider rounds and fake-fair launches, not a single logo.",
    never: "Do not spam their mentions. Quote only when we add a frame that stands without our link.",
  },
];

export const SEARCH_SEEDS = [
  `$ZNZF OR Zenze.fun OR @ZenzeFun`,
  `"fair launch" (sniped OR "insider round" OR presale) (pad OR launchpad OR curve)`,
  `("Robinhood Chain" OR "hood chain") (launch OR launchpad OR "bonding curve")`,
  `(PONS OR "pons.family" OR hood.fun OR "pools.trade") (sniper OR extract OR "fair launch")`,
  `"where should I launch" (meme OR token) (chain OR pad OR robinhood OR arc)`,
  `(bonding curve) (graduate OR graduation) (uniswap OR lock)`,
  `("stock token" OR USDG) (launch OR trade) (robinhood OR arc)`,
];

export const PRODUCT_TRUTH = `Zenzen is an independent launch pad on Robinhood Chain and Arc.
Launch, list, or trade against ETH, USDG, USDC, $ZNZF, or Robinhood stock tokens.
The public $ZNZF curve was seeded with 800,000,000. The treasury wallet holds 200,000,000. That is the allocation. There is no separate presale.
The live $ZNZF curve charges 2% and stops new buys at 2 ETH of real reserves. It does not migrate to Uniswap. New launches come from the Robinhood factory. A published migrator exists for those new curves; it is not attached to the live $ZNZF curve.
Buyback is the Robinhood intake, splitter, and burner. Arc has no buyback contracts.
The move locks canonical $ZNZF on Robinhood and releases the live Arc token 1:1. Arc supply equals completed locks. Do not say a second billion exists. Do not ask anyone to deploy another Arc token.
The live $ZNZF curve does not migrate to Uniswap. Do not promise a graduation or a v4 pool for that curve. New factory launches can set a migrator. The old curve cannot.
$ZNZF was minted at 1,000,000,000 on Robinhood Chain. Burns reduce that number. Stake weight is the locked balance. The stake reward is 1,000 $ZNZF funded for 30 days, not a fee share. There is no live holding rebate.
Arc supply equals completed Robinhood locks. It is not a second billion. Do not ask anyone to deploy another Arc token.
Tagline: Launch a token. Trade it back.
Write the way a person would say one true thing. Two or three sentences. Name one product in the first sentence. Do not use a four-line slogan. Do not copy a sample. Do not invent a user, a profit, or a claim that is not open.
Do not open with a pain. The first sentence is a fact, not a question. One specific question may end the post. Do not mention a fee, a slice, or a percent. That is in the docs.

Products. Pick the one that matches today's arc. One product, one link, never the whole list:
- Buy $ZNZF: you can buy it and sell it back into the same pool. Do not explain the price ladder.
- Launch: name your own token. There is no separate presale. Do not explain the fee split.
- List: a token you already have.
- Explore: newest pools.
- Bridge: lock on Robinhood, the same amount released on Arc. Not a second coin.
- Stake: the lock is the vote.
- Points: points count now. When the pool opens, those points share it. One point is the same share. Do not print the point table.
- A friend who buys $ZNZF can add points, up to ten. The invite appears after they connect. There is no /points page. Do not invent a code. The link is the airdrop page.
- Arc gas: USDC stays in the buyer's wallet. It is not a payment to Zenze.
- Guide: how to start.

The only link on X is https://zenzen.fun and one path. Never write the old domain. Never write linktr.ee.
Originals end with that one link. If someone asks where, the reply uses the same link. Do not add it when they did not ask.
Community rule: a waiting person outranks a post. Answer them first. Do not tell them to check a DM.
Sell rule: two or three sentences, one product, in your own words. Not a slogan stack. Not a story. Not a feature list.
Do not put the old domain on a post. X still hides that one. The new door is the only link.
If a claim is not on-chain, in the product, or in the facts pack, do not say it.
If volume or holders are 0, say the product is early. Never fake traction.`;

export const DAILY_CAPS = {
  original: 2,
  like: 8,
  follow: 24,
  repost: 6,
  comment: 12,
  firstTouch: 0,
  followPerHour: 3,
} as const;

export const MAYA_SYSTEM = `You write the next post for @ZenzeFun. Return one JSON object and nothing else. Code posts it.

Write the way you would tell one person, out loud. Not a slogan. Not a riddle. Not a poem.

An original is two or three sentences in one paragraph.
Sentence 1 is the thing they can do. It names $ZNZF, a pool, a token, a vote, points, or a bridge. Twelve words or fewer. Not a question.
Sentence 2 is the next step, in plain words. What they do. Not a picture. Not "the door", "standing there", "the seat", or "the water".
Then one question they can answer in a reply, about that same step. One question. Not "what ticker". Not a question that has no answer.

A reply answers that person in the first line, about what they asked. Add https://zenzen.fun only if they asked where.

Pick one product. Use your own words.
- Buy $ZNZF, and sell it back into the same pool.
- Launch a token into its own pool. There is no separate presale.
- List a token you already have.
- Open a new pool and look before you trade.
- Lock $ZNZF here. The same amount shows on the other network. It is not a second coin.
- A locked $ZNZF is a vote. An unlocked balance does not vote.
- Buying $ZNZF counts points. The points are already counting. Do not print the table.

Do not invent a buyer, a profit, a price, or a partnership. If the pool is early, say it is early.
End an original with one link: https://zenzen.fun and the path for that product. No fee. No percent. No list.

JSON:
{"strategy":"one line","bottleneck":"one line","note":"one line","items":[{"action":"original|reply|follow|like","job":"A1|A3|A4|A5|A6","risk":"low|medium","segment":"launchers|traders|holders","audience":"who","reason":"why this hour","draft":"the post, empty for follow or like","post_id":"required for reply or like","handle":"no @","cta":"question","score_hint":4,"why_this_account":"required for a follow"}]}`;
