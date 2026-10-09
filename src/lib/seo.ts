import { isZnzfRef } from "./token-path";

export const SITE = {
  name: "Zenzen",
  url: "https://zenzen.fun",
  tagline: "Launch a token. Trade it back.",
  description:
    "Name a token on Robinhood Chain or Arc, then buy and sell it in the same pool. The rules are in the docs.",
  x: "https://x.com/ZenzeFun",
  handle: "@ZenzeFun",
};

/** Bump when share cards or favicons change so X recrawls instead of a cached black card. */
export const OG_VERSION = "20260924c";
export const ASSET_VERSION = OG_VERSION;
/** zenze.fun stays reachable. It does not redirect, and it does not name zenzen.fun as its canonical. */
const BURNED_HOSTS = new Set(["zenze.fun", "www.zenze.fun"]);

export function requestHost(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return window.location.hostname.toLowerCase();
  }
  if (!import.meta.env.SSR) return "";
  try {
    const { getRequest } = require("@tanstack/react-start/server") as {
      getRequest: () => { headers: Headers };
    };
    const headers = getRequest().headers;
    const raw = headers.get("x-forwarded-host") || headers.get("host") || "";
    return raw.split(",")[0]?.trim().replace(/:\d+$/, "").toLowerCase() ?? "";
  } catch {
    return "";
  }
}

export function publicSite(): { origin: string; burned: boolean } {
  if (BURNED_HOSTS.has(requestHost())) return { origin: "https://zenze.fun", burned: true };
  return { origin: SITE.url, burned: false };
}

export function cardUrl(id = "home"): string {
  const safe = id.replace(/[^a-z0-9_-]/gi, "").slice(0, 80) || "home";
  return `${SITE.url}/cards/${safe}?v=${OG_VERSION}`;
}

export const DEFAULT_OG = cardUrl("home");
export const ZNZF_OG = cardUrl("znzf");

export function cardIdFromPath(path: string): string {
  if (!path || path === "/") return "home";
  const token = path.match(/^\/token\/([a-z0-9_-]+)/i);
  if (path === "/znzf" || path === "/token/znzf" || (token?.[1] && isZnzfRef(token[1]))) return "znzf";
  if (token?.[1]) return token[1].toLowerCase();
  const page = path.replace(/^\//, "").split("/")[0]?.toLowerCase() ?? "home";
  return page || "home";
}

export const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE.url}/explore?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/brand/capy-mark-64.png?v=${ASSET_VERSION}`,
      slogan: SITE.tagline,
      sameAs: [SITE.x],
    },
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description: SITE.description,
    },
  ],
};

export function pageTitle(page?: string) {
  return page ? `${page} · ${SITE.name}` : `${SITE.name} — ${SITE.tagline}`;
}

/** Never pass a square token logo here — X letterboxes it on black. Use cardUrl(). */
export function absoluteShareImage(src?: string | null, fallback = DEFAULT_OG): string {
  if (!src) return fallback;
  const url = src.trim();
  if (!url || url.startsWith("data:")) return fallback;
  if (url.includes("/cards/")) return url;
  if (url.endsWith("/og.jpg") || url.includes("/og.jpg?") || url.includes("/znzf-og.jpg")) {
    return url.startsWith("http") ? url : `${SITE.url}${url.startsWith("/") ? url : `/${url}`}`;
  }
  return fallback;
}

export function pageHead(opts: {
  title?: string;
  description: string;
  path: string;
  index?: boolean;
  image?: string;
  imageAlt?: string;
}) {
  const site = publicSite();
  const stealth = opts.index === false;
  const hidden = stealth || site.burned;
  const title = opts.title ? pageTitle(opts.title) : pageTitle();
  const description = stealth ? SITE.description : opts.description;
  const image = stealth ? DEFAULT_OG : opts.image || cardUrl(cardIdFromPath(opts.path));
  const imageAlt = opts.imageAlt || `${SITE.name} — ${SITE.tagline}`;
  const origin = site.burned ? site.origin : SITE.url;
  const url = `${origin}${opts.path === "/" ? "/" : opts.path}`;
  const shareImage = site.burned ? image.replaceAll(SITE.url, origin) : image;
  const meta: Array<Record<string, string>> = [
    { title: stealth && !opts.title ? SITE.name : title },
    { name: "description", content: description },
    { name: "robots", content: hidden ? "noindex,nofollow,noarchive,nosnippet,noimageindex" : "index,follow" },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "en_US" },
    { property: "og:site_name", content: SITE.name },
    { property: "og:title", content: stealth ? SITE.name : title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: shareImage },
    { property: "og:image:secure_url", content: shareImage },
    { property: "og:image:alt", content: imageAlt },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:type", content: "image/jpeg" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: SITE.handle },
    { name: "twitter:creator", content: SITE.handle },
    { name: "twitter:title", content: stealth ? SITE.name : title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: shareImage },
    { name: "twitter:image:alt", content: imageAlt },
  ];
  return {
    meta,
    links: hidden ? [] : [{ rel: "canonical", href: url }],
    scripts: hidden
      ? []
      : [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: title,
              description,
              url,
              isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
            }),
          },
        ],
  };
}
