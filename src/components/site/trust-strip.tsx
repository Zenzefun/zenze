import { ExternalLink, Github, Send, ShieldCheck } from "lucide-react";
import { ChainMark } from "@/components/chains/chain-mark";
import { CHAINS } from "@/lib/chains";
import { publishedContractLinks } from "@/lib/contract-links";
import { formatAddress } from "@/lib/format";
import { ZENZEN_LINKS } from "@/lib/socials";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 text-sm font-medium text-stone transition-colors duration-200 hover:border-gold hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SocialLinks({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <a className={chip} href={ZENZEN_LINKS.x} target="_blank" rel="noopener noreferrer">
        <XMark className="size-3.5" />
        @ZenzeFun
      </a>
      <a className={chip} href={ZENZEN_LINKS.telegram} target="_blank" rel="noopener noreferrer">
        <Send className="size-4" aria-hidden />
        Telegram
      </a>
      <a className={chip} href={ZENZEN_LINKS.github} target="_blank" rel="noopener noreferrer">
        <Github className="size-4" aria-hidden />
        Source on GitHub
      </a>
    </div>
  );
}

/** Home trust strip: non-custodial note, explorer links for the live contracts, socials. */
export function TrustStrip({ className }: { className?: string }) {
  const contracts = publishedContractLinks();
  return (
    <section aria-labelledby="trust-title" className={cn("stone-card rounded-2xl p-4 sm:p-5", className)}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="trust-title" className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-moss" aria-hidden />
          Check it yourself
        </h2>
        <p className="text-sm text-muted-foreground">Non-custodial. Your wallet signs every trade. The code is public.</p>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {contracts.map((c) => (
          <li key={`${c.label}-${c.chain}`}>
            <a
              className={chip}
              href={`${CHAINS[c.chain].explorer}/address/${c.address}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${c.label} on ${CHAINS[c.chain].name}: ${c.address} (opens explorer)`}
            >
              <ChainMark chain={c.chain} className="size-4" />
              {c.label}
              <span className="text-xs text-muted-foreground">{CHAINS[c.chain].short}</span>
              <span className="font-mono text-xs text-muted-foreground">{formatAddress(c.address)}</span>
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
      <SocialLinks className="mt-3" />
    </section>
  );
}
