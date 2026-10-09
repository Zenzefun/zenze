import { createRouter } from "@tanstack/react-router";
import { PublicNotFound } from "@/components/not-found-public";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: PublicNotFound,
    defaultPreload: "intent",
    defaultPreloadDelay: 80,
    defaultStaleTime: 15_000,
    scrollRestoration: true,
    defaultViewTransition: {
      types: ({ pathChanged }) => (pathChanged ? ["nav"] : false),
    },
  });
}