import { SITE } from "@/lib/seo";
import { isProtocolToken } from "@/lib/pool";
import { isZnzfRef, znzfLaunchpadId } from "@/lib/token-path";

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
  if (isProtocolToken(token)) {
    return `$${sym} is the token of Zenzen. Trade it here. It stays in this pool.`;
  }
  const blurb = (token.description ?? "").trim().replace(/\s+/g, " ");
  const short = blurb.length > 90 ? `${blurb.slice(0, 87).trim()}…` : blurb;
  const extra = short ? ` ${short}` : "";
  return `$${sym} · ${token.name} on Zenzen.${extra}`.trim().slice(0, 240);
}

export function tweetForPath(path: string) {
  switch (path) {
    case "/":
      return "Your token can have a pool today.\nName it.\nPick the pair.\nLaunch it.";
    case "/explore":
      return "New pools sit at the top.\nOpen one.\nBuy it, or sell it back.\nLook first.";
    case "/launch":
      return "Your token can have a pool today.\nName it.\nPick the pair.\nLaunch it.";
    case "/list":
      return "You already have a token.\nList the contract you deployed.\nDo not deploy a second one.\nList it.";
    case "/znzf":
      return "$ZNZF has a pool.\nYou buy it there.\nYou can sell it back into that same pool.\nBuy $ZNZF.";
    case "/staking":
      return "A locked $ZNZF is a vote.\nYou lock it.\nA balance in the wallet does not vote.\nLock it.";
    case "/governance":
      return "Your say is the $ZNZF you lock.\nAn unlocked balance does not vote.\nYou can unlock it later.\nLock it.";
    case "/analytics":
      return "This is what people traded.\nA zero means nobody traded.\nThe numbers are the trades.\nRead them.";
    case "/capyai":
      return "Ask before you buy.\nCapy reads the pool you pick.\nIt stays quiet until you ask.\nOpen it.";
    case "/move":
    case "/bridge":
      return "$ZNZF can sit on the other network.\nYou lock it here.\nThe same amount shows up there.\nMove it.";
    case "/guide":
      return "You can buy $ZNZF.\nYou can launch your own.\nYou can list one you already have.\nStart.";
    case "/docs":
      return "The rules live in the docs.\nThe fee is there.\nThe pool rules are there.\nRead them.";
    case "/legal":
      return "Terms, privacy, and the risks.\nRead them before you sign.";
    default:
      return `${SITE.tagline} ${SITE.name}.`;
  }
}

export function ogTitleForToken(token: ShareToken) {
  return `$${ticker(token.symbol)}`;
}

export function ogDescriptionForToken(token: ShareToken) {
  if (isProtocolToken(token)) {
    return "This is the token of Zenzen. You can buy and sell it here. It stays in this pool.";
  }
  const chain = chainName(token);
  const blurb = (token.description ?? "").trim().replace(/\s+/g, " ");
  if (blurb) return `${token.name} ($${ticker(token.symbol)}) on Zenzen. ${blurb.slice(0, 140)}`.slice(0, 180);
  return `${token.name} ($${ticker(token.symbol)}) on ${chain}. Trade on Zenzen.`;
}

export function tokenSharePath(id: string, contract?: string | null) {
  if (isZnzfRef(id) || isZnzfRef(contract ?? "")) {
    const live = znzfLaunchpadId();
    if (live.startsWith("0x")) return `/token/${live}`;
  }
  if (contract && /^0x[a-fA-F0-9]{40}$/.test(contract)) return `/token/${contract}`;
  return `/token/${id}`;
}
