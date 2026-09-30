import { createRouter } from "@tanstack/react-router";
import { PublicNotFound } from "@/components/not-found-public";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

function AppPending() {
  return null;
}

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultPendingComponent: AppPending,
    defaultNotFoundComponent: PublicNotFound,
  });
}
