import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { BrandLockup } from "@/components/capy/capy-mark";
import { ChainMark } from "@/components/chains/chain-mark";
import { SocialLinks } from "@/components/site/trust-strip";
import { CHAINS } from "@/lib/chains";
import { publishedContractLinks } from "@/lib/contract-links";
import { formatAddress } from "@/lib/format";

const LINKS =
  "mt-1 grid grid-cols-2 gap-x-4 text-sm text-muted-foreground sm:mt-3 sm:block sm:space-y-2 [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:rounded-sm [&_a]:transition-colors [&_a]:duration-200 [&_a]:hover:text-foreground [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring sm:[&_a]:inline-flex sm:[&_a]:min-h-0";

export function Footer() {
  return (
    <footer className="shell-foot mt-auto border-t border-border bg-sand/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Link to="/" aria-label="Zenzen home" className="inline-flex">
            <BrandLockup markClassName="size-8" />
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Launch a token. Trade it back. The pool opens the moment you launch, on Robinhood Chain or Arc.
          </p>
          <SocialLinks className="mt-4" />
          <p className="mt-5 text-sm font-medium text-stone">Contracts</p>
          <ul className="mt-1 grid gap-x-4">
            {publishedContractLinks().map((c) => (
              <li key={`${c.label}-${c.chain}`}>
                <a
                  href={`${CHAINS[c.chain].explorer}/address/${c.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
                  aria-label={`${c.label} on ${CHAINS[c.chain].name}: ${c.address} (opens explorer)`}
                >
                  <ChainMark chain={c.chain} className="size-4" />
                  {c.label}
                  <span className="text-xs">{CHAINS[c.chain].short}</span>
                  <span className="font-mono text-xs">{formatAddress(c.address)}</span>
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-stone">Product</p>
          <ul className={LINKS}>
            <li><Link to="/explore">Explore</Link></li>
            <li><Link to="/launch">Launch</Link></li>
            <li><Link to="/list">List a token</Link></li>
            <li><Link to="/znzf">$ZNZF</Link></li>
            <li><Link to="/airdrop">Airdrop</Link></li>
            <li><Link to="/staking">Stake</Link></li>
            <li><Link to="/governance">Governance</Link></li>
            <li><Link to="/analytics">Analytics</Link></li>
            <li><Link to="/capyai">Capy AI</Link></li>
            <li><Link to="/bridge">Bridge</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-stone">More</p>
          <ul className={LINKS}>
            <li><Link to="/fund">Add USDC</Link></li>
            <li><Link to="/guide">Guide</Link></li>
            <li><Link to="/docs">Docs</Link></li>
            <li><Link to="/legal">Legal</Link></li>
            <li><Link to="/portfolio">Portfolio</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl border-t border-border/70 px-4 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Zenzen is a noncustodial interface. It does not hold your assets, it does not send or undo a trade, and it is not a bank, broker, exchange, custodian, or adviser. Nothing on this site is financial, legal, or tax advice. A token launched here is issued by its creator, not by Zenzen. It can fall to zero, and it can have no buyer. A listing or a rank is not an endorsement. You choose the trade, you hold the wallet, and you follow the law where you are. Zenzen is not Robinhood Markets and not Circle.
        </p>
      </div>
      <div className="border-t border-border/70 py-4 text-center text-xs text-muted-foreground">
        © 2026 Zenzen · $ZNZF · v2.11.0
      </div>
    </footer>
  );
}
