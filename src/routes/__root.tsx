import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "sonner";
import { CapyPreloader } from "@/components/capy/capy-preloader";
import { PublicNotFound } from "@/components/not-found-public";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { MaintenanceGate } from "@/components/site/maintenance-gate";
import { ThemeProvider, useTheme } from "@/components/theme/theme-provider";
import { AppKitRoot } from "@/components/wallet/appkit-root";
import { ConnectModal } from "@/components/wallet/connect-modal";
import { AuthProvider } from "@/lib/auth/provider";
import { ASSET_VERSION, SITE, jsonLd } from "@/lib/seo";
import { CHUNK_RECOVERY_BOOT } from "@/lib/chunk-error";
import { BOOT_CSS, THEME_BOOT } from "@/lib/capy-boot";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#FDF6E3" },
      { name: "color-scheme", content: "light dark" },
      { name: "application-name", content: SITE.name },
      { name: "msapplication-TileColor", content: "#D4A545" },
    ],
    links: [
      { rel: "icon", href: `/brand/capy-mark-64.png?v=${ASSET_VERSION}`, type: "image/png", sizes: "64x64" },
      { rel: "icon", href: `/brand/capy-mark-64.png?v=${ASSET_VERSION}` },
      { rel: "apple-touch-icon", href: `/brand/capy-mark-64.png?v=${ASSET_VERSION}` },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" },
      { rel: "preload", href: `/brand/capy-mark-64.png?v=${ASSET_VERSION}`, as: "image" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootDocument,
  notFoundComponent: PublicNotFound,
});

function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      toastOptions={{
        className: "font-sans",
      }}
    />
  );
}

function RootDocument() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_BOOT }} />
        <noscript>
          <style>{`#capy-boot{display:none!important}`}</style>
        </noscript>
        <HeadContent />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <div id="capy-boot" aria-hidden="true" suppressHydrationWarning>
          <div className="capy-boot-frame">
            <span className="capy-boot-skel" />
            <img src="/brand/capy-mark-64.png?v=20260924b" alt="" width={112} height={112} decoding="sync" suppressHydrationWarning />
          </div>
        </div>
        <PreviewHostBridge />
        <ThemeProvider>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <CapyPreloader />
              <AppKitRoot>
                <MaintenanceGate>
                  <Outlet />
                </MaintenanceGate>
                <ConnectModal />
              </AppKitRoot>
              <AppToaster />
            </QueryClientProvider>
          </AuthProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
