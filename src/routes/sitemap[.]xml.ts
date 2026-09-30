import { createFileRoute } from "@tanstack/react-router";
import { DOCS } from "@/lib/docs-content";
import { getSql } from "@/lib/db";
import { SITE } from "@/lib/seo";
import { tokenRouteId, znzfLaunchpadId } from "@/lib/token-path";

const STATIC = [
  "/",
  "/explore",
  "/launch",
  "/list",
  "/znzf",
  `/token/${znzfLaunchpadId()}`,
  "/staking",
  "/governance",
  "/analytics",
  "/capyai",
  "/bridge",
  "/fund",
  "/guide",
  "/airdrop",
  "/docs",
  "/legal",
  ...DOCS.filter((doc) => doc.slug !== "overview").map((doc) => `/docs/${doc.slug}`),
];

function esc(value: string) {
  return value.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function day(value: unknown, fallback: string) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

async function tokenUrls(fallback: string) {
  try {
    const sql = await getSql();
    const rows = await sql<{ id: string; contract_address: string | null; created_at: string | Date }>`
      select id, contract_address, created_at
      from tokens
      order by created_at desc
      limit 400
    `;
    return rows.map((row) => ({
      path: `/token/${tokenRouteId(row)}`,
      lastmod: day(row.created_at, fallback),
    }));
  } catch {
    return [];
  }
}

function xml(entries: { path: string; lastmod: string }[]) {
  const seen = new Set<string>();
  const urls = entries.flatMap((entry) => {
    const path = entry.path.startsWith("/") ? entry.path : `/${entry.path}`;
    const loc = `${SITE.url}${path === "/" ? "/" : path}`;
    if (seen.has(loc)) return [];
    seen.add(loc);
    return [`  <url><loc>${esc(loc)}</loc><lastmod>${entry.lastmod}</lastmod></url>`];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const tokens = await tokenUrls(today);
        const body = xml([
          ...STATIC.map((path) => ({ path, lastmod: today })),
          ...tokens,
        ]);
        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
