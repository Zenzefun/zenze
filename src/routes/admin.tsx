import { createFileRoute, notFound } from "@tanstack/react-router";
import { PublicNotFound } from "@/components/not-found-public";
import { stealthNotFoundHead, stealthNotFoundHeaders } from "@/lib/stealth-not-found";

export const Route = createFileRoute("/admin")({
  loader: () => {
    throw notFound();
  },
  notFoundComponent: PublicNotFound,
  component: PublicNotFound,
  headers: stealthNotFoundHeaders,
  head: stealthNotFoundHead,
});
