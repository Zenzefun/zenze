import { Github, Send } from "lucide-react";
import { ZENZEN_LINKS } from "@/lib/socials";

/**
 * Telegram + GitHub on every page. Pages inside AppShell already show them in the full footer
 * (`.shell-foot`), so CSS hides this slim bar there (`body:has(.shell-foot)`); it still shows on
 * pages with no shell: login, admin, the 404 and the maintenance screen.
 */
export function CommunityFooter() {
  const link =
    "inline-flex min-h-11 items-center gap-1.5 rounded-sm px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <footer className="community-foot border-t border-border bg-sand/40 text-xs text-muted-foreground" aria-label="Community">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 px-4 py-2">
        <a className={link} href={ZENZEN_LINKS.telegram} target="_blank" rel="noopener noreferrer">
          <Send className="size-3.5" aria-hidden />
          Telegram
        </a>
        <a className={link} href={ZENZEN_LINKS.github} target="_blank" rel="noopener noreferrer">
          <Github className="size-3.5" aria-hidden />
          GitHub
        </a>
      </div>
    </footer>
  );
}
