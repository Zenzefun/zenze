import { createFileRoute } from "@tanstack/react-router";

const PAGES: Record<string, { title: string; tagline: string }> = {
  home: { title: "Zenze.fun", tagline: "Launch a token. You choose the pair and who receives the creator share." },
  explore: { title: "Explore", tagline: "Live pools on Robinhood Chain and Arc." },
  launch: { title: "Launch a token", tagline: "You name it, choose the pair, and set the creator share." },
  list: { title: "List a token", tagline: "Index an existing contract on Zenze.fun." },
  staking: { title: "Stake $ZNZF", tagline: "Lock tokens. Claim the funded reward. Not a fee share." },
  governance: { title: "Governance", tagline: "Vote weight is the locked $ZNZF balance." },
  analytics: { title: "Analytics", tagline: "Live figures from the pool ledger and published contracts." },
  ai: { title: "Capy AI", tagline: "On-demand reads of live Zenze.fun pools." },
  bridge: { title: "Bridge", tagline: "The same coin on the other network. Nothing extra is created." },
  guide: { title: "Guide", tagline: "Connect, launch, list, and trade. Stay zen." },
  docs: { title: "Docs", tagline: "Launch, listing, fee, and $ZNZF mechanics." },
  legal: { title: "Legal", tagline: "Terms, privacy, and risk disclosure." },
};

async function jpeg(id: string) {
  const { cardForTokenId, jpegHeaders, renderOgCard } = await import("@/lib/server/og-card.server");
  const key = id.replace(/\.jpe?g$/i, "").trim().toLowerCase();
  try {
    const buf =
      key === "home" || key === "og"
        ? await renderOgCard({ kind: "home" })
        : key === "znzf"
          ? await renderOgCard({ kind: "znzf", name: "Zenze", symbol: "ZNZF", chain: "Robinhood Chain" })
          : PAGES[key]
            ? await renderOgCard({ kind: "page", title: PAGES[key].title, tagline: PAGES[key].tagline })
            : await cardForTokenId(key);
    return new Response(Uint8Array.from(buf), { headers: jpegHeaders() });
  } catch {
    return new Response("Share card unavailable.", { status: 404, headers: { "content-type": "text/plain" } });
  }
}

export const Route = createFileRoute("/cards/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => jpeg(params.id),
      HEAD: async ({ params }) => {
        const res = await jpeg(params.id);
        return new Response(null, { status: res.status, headers: res.headers });
      },
    },
  },
});
