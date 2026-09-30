import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";
import { docsBySlug } from "@/lib/docs-content";
import { pageHead } from "@/lib/seo";

const doc = docsBySlug("overview")!;

export const Route = createFileRoute("/docs/")({
  component: DocsOverview,
  head: () =>
    pageHead({
      title: "Docs",
      description: doc.description,
      path: "/docs",
    }),
});

function DocsOverview() {
  return <DocsShell doc={doc} />;
}
