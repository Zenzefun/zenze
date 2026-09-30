import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { BrandLockup } from "@/components/capy/capy-mark";
import { NetworkSwitcher } from "@/components/chains/chain-select";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ConnectButton } from "@/components/wallet/connect-button";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatUsdTiny } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/explore", label: "Explore" },
  { to: "/launch", label: "Launch" },
  { to: "/znzf", label: "$ZNZF" },
  { to: "/staking", label: "Stake" },
  { to: "/airdrop", label: "Airdrop" },
] as const;

export function Header({ znzfPrice }: { znzfPrice?: number | null }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-background/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl min-w-0 items-center gap-1.5 px-3 sm:h-16 sm:gap-3 sm:px-4">
        <Link to="/" className="flex min-w-0 shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Zenze.fun home">
          <BrandLockup wordmarkClassName="hidden sm:inline text-lg lg:text-xl" />
        </Link>
        <nav className="ml-1 hidden min-w-0 items-center gap-0.5 sm:flex" aria-label="Main">
          {NAV.map((item) => {
            const active = path === item.to || path.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
          {znzfPrice != null && (
            <Link
              to="/znzf"
              className="hidden rounded-full border border-border bg-card px-2.5 py-1.5 text-xs font-medium tabular-nums text-stone xl:inline-flex"
            >
              $ZNZF {formatUsdTiny(znzfPrice)}
            </Link>
          )}
          <ThemeToggle />
          <NetworkSwitcher />
          <ConnectButton />
          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetTitle className="mb-6">
            <BrandLockup markClassName="size-8" wordmarkClassName="text-lg" />
          </SheetTitle>
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-muted",
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
