import { Link, useRouterState } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { useState } from "react";
import { BrandLockup } from "@/components/capy/capy-mark";
import { NetworkSwitcher } from "@/components/chains/chain-select";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ConnectButton } from "@/components/wallet/connect-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatUsdTiny } from "@/lib/format";
import { znzfLaunchpadId } from "@/lib/token-path";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/explore", label: "Explore" },
  { to: "/launch", label: "Launch", sheetOnly: true },
  { to: "/znzf", label: "$ZNZF" },
  { to: "/staking", label: "Stake" },
  { to: "/airdrop", label: "Creator Quest" },
] as const;

export function Header({ znzfPrice }: { znzfPrice?: number | null }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="shell-bar sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="mx-auto flex h-14 max-w-6xl min-w-0 items-center gap-2 rounded-2xl border border-border bg-background/80 px-3 shadow-[0_16px_40px_-24px_rgba(60,40,10,0.35)] backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-4">
        <Link to="/" className="flex min-w-0 shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Zenzen home">
          <BrandLockup wordmarkClassName="hidden sm:inline text-lg lg:text-xl" />
        </Link>
        <nav className="ml-1 hidden min-w-0 items-center gap-1 sm:flex" aria-label="Main">
          {NAV.filter((item) => !("sheetOnly" in item)).map((item) => {
            const active = path === item.to || path.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors duration-300 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
          {znzfPrice != null && (
            <Link
              to="/znzf"
              className="hidden rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold tabular-nums text-stone transition-colors duration-300 ease-soft hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:inline-flex"
            >
              $ZNZF {formatUsdTiny(znzfPrice)}
            </Link>
          )}
          <ThemeToggle />
          <NetworkSwitcher />
          <Button asChild variant="gold" size="sm" className="hidden min-h-11 rounded-full sm:inline-flex">
            <Link to="/launch" aria-current={path === "/launch" ? "page" : undefined}>
              <Rocket aria-hidden />
              Launch
            </Link>
          </Button>
          <ConnectButton />
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setOpen(true)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <MenuGlyph open={open} />
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle className="mb-6">
            <BrandLockup markClassName="size-8" wordmarkClassName="text-lg" />
          </SheetTitle>
          <div className="flex flex-col gap-2">
            {NAV.map((item, index) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                style={{ animationDelay: `${Math.min(index * 60, 400)}ms` }}
                className={cn(
                  "nav-link-in inline-flex min-h-11 items-center rounded-lg px-3 text-base font-semibold transition-colors duration-300 ease-soft hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  path === item.to || path.startsWith(`${item.to}/`) ? "bg-muted text-foreground" : "",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <span className="relative block size-5" aria-hidden>
      <span
        className={cn(
          "absolute left-0 top-1.5 h-0.5 w-5 origin-center bg-current transition-transform duration-500 ease-soft",
          open && "translate-y-1 rotate-45",
        )}
      />
      <span
        className={cn(
          "absolute left-0 top-2.5 h-0.5 w-5 bg-current transition-opacity duration-300 ease-soft",
          open && "opacity-0",
        )}
      />
      <span
        className={cn(
          "absolute left-0 top-3.5 h-0.5 w-5 origin-center bg-current transition-transform duration-500 ease-soft",
          open && "-translate-y-1 -rotate-45",
        )}
      />
    </span>
  );
}

const BAR_PATHS = new Set(["/", "/explore", "/znzf"]);

/** Sticky phone-only Launch / Buy $ZNZF bar. Renders a spacer so the footer is never hidden. */
export function MobileActionBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!BAR_PATHS.has(path)) return null;
  return (
    <>
      <div className="h-[calc(5.5rem+env(safe-area-inset-bottom))] sm:hidden" aria-hidden />
      <div
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-2xl border border-border bg-background/85 p-3 shadow-[0_16px_40px_-24px_rgba(60,40,10,0.45)] backdrop-blur-xl sm:hidden"
        role="region"
        aria-label="Quick actions"
      >
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Button asChild variant="gold" className="rounded-full">
            <Link to="/launch">
              <Rocket aria-hidden />
              Launch a token
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full bg-card">
            <Link to="/token/$id" params={{ id: znzfLaunchpadId() }}>
              Buy $ZNZF
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
