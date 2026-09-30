/** Open the current page inside a mobile wallet’s in-app browser. Never send the user to a download store when a deeplink exists. */

export function isMobileUa(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** True when this page is already running inside a wallet’s dapp browser. */
export function inWalletInAppBrowser(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return /OKApp|OKX|MetaMaskMobile|TrustWallet|TokenPocket|BitKeep|Bitget|Phantom|Rainbow|CoinbaseWallet|imToken|Binance|Rabby/i.test(
    ua,
  );
}

export function iabWalletId(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): string | null {
  if (/OKApp|OKX/i.test(ua)) return "okx";
  if (/MetaMaskMobile|MetaMask/i.test(ua) && /Mobile/i.test(ua)) return "metamask";
  if (/TrustWallet|Trust/i.test(ua) && /Mobile/i.test(ua)) return "trust";
  if (/TokenPocket/i.test(ua)) return "tokenpocket";
  if (/BitKeep|Bitget/i.test(ua)) return "bitget";
  if (/Phantom/i.test(ua)) return "phantom";
  if (/Rainbow/i.test(ua)) return "rainbow";
  if (/CoinbaseWallet/i.test(ua)) return "coinbase";
  if (/imToken/i.test(ua)) return "imtoken";
  if (/Binance/i.test(ua)) return "binance";
  if (/Rabby/i.test(ua)) return "rabby";
  return null;
}

export function dappDeeplink(walletId: string, pageUrl: string): string | null {
  const u = encodeURIComponent(pageUrl);
  const host = pageUrl.replace(/^https?:\/\//, "");
  switch (walletId) {
    case "okx":
      return `okx://wallet/dapp/url?dappUrl=${u}`;
    case "metamask":
      return `https://metamask.app.link/dapp/${host}`;
    case "trust":
      return `trust://open_url?coin_id=60&url=${u}`;
    case "coinbase":
      return `https://go.cb-w.com/dapp?cb_url=${u}`;
    case "rainbow":
      return `https://rnbwapp.com/dapp?url=${u}`;
    case "phantom":
      return `https://phantom.app/ul/browse/${u}?ref=${u}`;
    case "bitget":
      return `bitkeep://bkconnect?action=dapp&url=${u}`;
    case "binance":
      return `bnc://app.binance.com/cedefi/dapp?url=${u}`;
    case "tokenpocket":
      return `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url: pageUrl }))}`;
    case "imtoken":
      return `imtokenv2://navigate/DappView?url=${u}`;
    case "rabby":
      return `rabby://dapp?url=${u}`;
    case "safepal":
      return `safepal://wallet/dapp?url=${u}`;
    case "bybit":
      return `bybitapp://open/dapp?url=${u}`;
    default:
      return null;
  }
}
