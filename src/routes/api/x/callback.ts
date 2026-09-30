import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/x/callback")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 302, headers: { location: "https://zenze.fun/airdrop" } }),
    },
  },
});