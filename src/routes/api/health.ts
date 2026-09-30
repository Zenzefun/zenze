import { createFileRoute } from "@tanstack/react-router";
import { healthResponse } from "@/lib/server/health-response";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => healthResponse(),
    },
  },
});
