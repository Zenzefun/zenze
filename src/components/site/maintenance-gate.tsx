import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MaintenancePage } from "@/components/site/maintenance-page";
import { publicConfig } from "@/lib/server/market";

function isStealthPath(pathname: string) {
  return (
    pathname === "/arise" ||
    pathname.startsWith("/arise/") ||
    pathname === "/login" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const cfg = useQuery({
    queryKey: ["public-config"],
    queryFn: () => publicConfig(),
    staleTime: 15_000,
  });
  // Desk + decoy 404s stay themselves during a public close-onsen.
  if (isStealthPath(pathname)) return children;
  if (cfg.data?.maintenance === "true") {
    return <MaintenancePage message={cfg.data.maintenance_message} />;
  }
  return children;
}
