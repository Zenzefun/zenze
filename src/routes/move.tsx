import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/move")({
  beforeLoad: () => {
    throw redirect({ to: "/bridge", replace: true });
  },
});
