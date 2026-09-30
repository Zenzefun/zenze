import { SITE } from "@/lib/seo";
import { isZnzfRef, znzfLaunchpadId, znzfTradePath } from "@/lib/token-path";

export type ShareToken = {
  id?: string;
  name: string;
  symbol: string;
  description?: string | null;
  chain?: { name: string } | string | null;
};

function chainName(token: ShareToken) {
  if (!token.chain) return "Robinhood Chain and Arc";
  return typeof token.chain === "string" ? token.chain : token.chain.name;
}

function ticker(symbol: string) {
  return symbol.trim().replace(/^\$/, "").toUpperCase();
}

/** Tweet body only — the intent URL is attached separately. Stay under ~220 so X does not clip. */
export function tweetForToken(token: ShareToken) {
  const sym = ticker(token.symbol);
  const blurb = (token.description ?? "").trim().replace(/\s+/g, " ");
  const short = blurb.length > 90 ? `${blurb.slice(0, 87).trim()}…` : blurb;
  const extra = short ? ` ${short}` : "";
  return `$${sym} · ${token.name} on Zenze.fun.${extra}`.trim().slice(0, 240);
}

export function tweetForPath(path: string) {
  switch (path) {
    case "/":
      return `Buy $ZNZF earlier and you pay less than the next buyer. You can sell it back. The trade takes 2%. https://zenze.fun${znzfTradePath()}`;
    case "/explore":
      return "Newest pools first. On a new pool, buying earlier means you pay less than the next buyer.";
    case "/launch":
      return "Name a token and buy it first. You keep the creator share you set. https://zenze.fun/launch";
    case "/list":
      return "Already have a token? List it so buyers can find it. https://zenze.fun/list";
    case "/znzf":
      return `Buy $ZNZF earlier and you pay less than the next buyer. You can sell it back. The trade takes 2%. https://zenze.fun${znzfTradePath()}`;
    case "/staking":
      return "Lock $ZNZF and your vote counts. You can take it back. The reward is only what the treasury already funded.";
    case "/governance":
      return "Your say is the $ZNZF you lock. A balance left in your wallet does not vote.";
    case "/analytics":
      return "What people actually traded on Zenze. A zero means nobody traded.";
    case "/capyai":
      return "Ask before you buy. Capy reads the pool and stays quiet until you ask.";
    case "/move":
    case "/bridge":
      return "The same $ZNZF on the other network. Lock some here, the same amount shows up there.";
    case "/guide":
      return "Buy $ZNZF, launch your own, or list one you already have. https://zenze.fun/guide";
    case "/docs":
      return "Buy earlier, pay less, sell back. The docs are the exact rules. https://zenze.fun/docs";
    case "/legal":
      return "Terms, privacy, and risk disclosure for Zenze.fun.";
    default:
      return `${SITE.tagline} ${SITE.name}.`;
  }
}

export function ogTitleForToken(token: ShareToken) {
  return `$${ticker(token.symbol)}`;
}

export function ogDescriptionForToken(token: ShareToken) {
  const chain = chainName(token);
  const blurb = (token.description ?? "").trim().replace(/\s+/g, " ");
  if (blurb) return `${token.name} ($${ticker(token.symbol)}) on Zenze.fun. ${blurb.slice(0, 140)}`.slice(0, 180);
  return `${token.name} ($${ticker(token.symbol)}) on ${chain}. Trade on Zenze.fun.`;
}

export function tokenSharePath(id: string, contract?: string | null) {
  if (isZnzfRef(id) || isZnzfRef(contract ?? "")) {
    const live = znzfLaunchpadId();
    if (live.startsWith("0x")) return `/token/${live}`;
  }
  if (contract && /^0x[a-fA-F0-9]{40}$/.test(contract)) return `/token/${contract}`;
  return `/token/${id}`;
}
