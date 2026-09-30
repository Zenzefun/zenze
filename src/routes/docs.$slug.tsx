import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";
import { PublicNotFound } from "@/components/not-found-public";
import { docsBySlug } from "@/lib/docs-content";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/docs/$slug")({
  loader: ({ params }) => {
    if (params.slug === "overview") throw redirect({ to: "/docs", statusCode: 301 });
    const doc = docsBySlug(params.slug);
    if (!doc) throw notFound();
    return doc;
  },
  component: DocsSlug,
  notFoundComponent: PublicNotFound,
  head: ({ loaderData, params }) =>
    pageHead({
      title: loaderData?.title ?? "Docs",
      description: loaderData?.description ?? "Zenze protocol docs.",
      path: `/docs/${params.slug}`,
    }),
});

function DocsSlug() {
  const doc = Route.useLoaderData();
  return <DocsShell doc={doc} />;
}
