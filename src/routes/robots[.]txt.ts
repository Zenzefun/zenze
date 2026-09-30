import { createFileRoute } from "@tanstack/react-router";
import { SITE } from "@/lib/seo";

const BODY = `User-agent: *
Allow: /
Disallow: /arise
Disallow: /admin
Disallow: /login
Disallow: /api/

Sitemap: ${SITE.url}/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(BODY, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
