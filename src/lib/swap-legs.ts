/** The token on this page cannot be replaced. Selling it pays ETH only. */

export type SwapLeg = {
  graphId: string;
  symbol?: string | null;
  tokenId?: string | null;
  native?: boolean;
};

export function isZnzfAsset(asset: { symbol?: string | null; tokenId?: string | null } | null | undefined): boolean {
  if (!asset) return false;
  if ((asset.tokenId ?? "").trim().toLowerCase() === "znzf") return true;
  return (asset.symbol ?? "").replace(/^\$/, "").trim().toUpperCase() === "ZNZF";
}

function sameLeg(a: SwapLeg | null | undefined, b: SwapLeg | null | undefined) {
  if (!a || !b) return false;
  if (a.graphId && b.graphId && a.graphId === b.graphId) return true;
  const aId = (a.tokenId ?? "").trim().toLowerCase();
  const bId = (b.tokenId ?? "").trim().toLowerCase();
  if (aId && bId && aId === bId) return true;
  const aSym = (a.symbol ?? "").replace(/^\$/, "").trim().toUpperCase();
  const bSym = (b.symbol ?? "").replace(/^\$/, "").trim().toUpperCase();
  return Boolean(aSym && aSym === bSym);
}

/** Buy: the page token stays put and the pay leg can change. Sell: the page token stays, and the payout is ETH. */
export function pageLegLocks(pay: SwapLeg | null, receive: SwapLeg | null, page: SwapLeg | null) {
  if (!page) return { payLocked: false, receiveLocked: false };
  const selling = sameLeg(pay, page);
  return { payLocked: selling, receiveLocked: selling || sameLeg(receive, page) };
}

export function flipSwapLegs<T extends SwapLeg>(pay: T, receive: T, native: T | null, page: T | null): { pay: T; receive: T } {
  if (sameLeg(receive, page)) {
    if (!native || sameLeg(native, page)) return { pay, receive };
    return { pay: receive, receive: native };
  }
  return { pay: receive, receive: pay };
}

export function applyPayPick<T extends SwapLeg>(next: T, pay: T, receive: T, native: T | null, page: T | null): { pay: T; receive: T } {
  if (pageLegLocks(pay, receive, page).payLocked) return { pay, receive };
  if (sameLeg(next, page)) {
    if (!native || sameLeg(native, page)) return { pay, receive };
    return { pay: next, receive: native };
  }
  if (next.graphId === receive.graphId) return flipSwapLegs(pay, receive, native, page);
  return { pay: next, receive };
}

export function applyReceivePick<T extends SwapLeg>(next: T, pay: T, receive: T, native: T | null, page: T | null): { pay: T; receive: T } {
  if (pageLegLocks(pay, receive, page).receiveLocked) return { pay, receive };
  if (next.graphId === pay.graphId) return flipSwapLegs(pay, receive, native, page);
  return { pay, receive: next };
}
