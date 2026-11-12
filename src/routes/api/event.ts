import { createFileRoute } from "@tanstack/react-router";
import { recordEvent } from "@/lib/server/events";

export const Route = createFileRoute("/api/event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null);
          if (!body) return new Response(null, { status: 204 });
          await recordEvent({ data: body });
        } catch {
          // never break the client
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
