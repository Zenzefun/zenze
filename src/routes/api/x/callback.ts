import { createFileRoute } from "@tanstack/react-router";
import { finishXAuthorize } from "@/lib/server/x-oauth.server";

export const Route = createFileRoute("/api/x/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        const fail = (reason?: string) => {
          const q = reason ? `&reason=${encodeURIComponent(reason)}` : "";
          return new Response(null, {
            status: 302,
            headers: { location: `https://zenzen.fun/portfolio?x=error${q}` },
          });
        };

        if (error || !code || !state) {
          return fail(errorDescription || error || "missing");
        }

        try {
          const result = await finishXAuthorize(code, state);
          if (!result.ok) return fail(result.error);
          return new Response(null, {
            status: 302,
            headers: {
              location: `https://zenzen.fun/portfolio?x=ok&handle=${encodeURIComponent(result.username)}`,
            },
          });
        } catch {
          return fail();
        }
      },
    },
  },
});
