import { Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/capy/capy-mark";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-sand/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Link to="/" aria-label="Zenze.fun home" className="inline-flex">
            <BrandLockup markClassName="size-8" />
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Launch a token, choose the pair, and choose who receives the creator share.
          </p>
          <a
            href="https://x.com/ZenzeFun"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-stone hover:text-gold"
          >
            @ZenzeFun on X
          </a>
        </div>
        <div>
          <p className="text-sm font-medium text-stone">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/explore">Explore</Link></li>
            <li><Link to="/launch">Launch</Link></li>
            <li><Link to="/list">List a token</Link></li>
            <li><Link to="/znzf">$ZNZF</Link></li>
            <li><Link to="/airdrop" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Airdrop</Link></li>
            <li><Link to="/staking">Stake</Link></li>
            <li><Link to="/governance">Governance</Link></li>
            <li><Link to="/analytics">Analytics</Link></li>
            <li><Link to="/capyai">Capy AI</Link></li>
            <li><Link to="/bridge" className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Bridge</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-stone">Calm print</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link to="/fund">Add USDC</Link></li>
            <li><Link to="/guide">Guide</Link></li>
            <li><Link to="/docs">Docs</Link></li>
            <li><Link to="/legal">Legal</Link></li>
            <li><Link to="/portfolio">Portfolio</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/70 py-4 text-center text-xs text-muted-foreground">
        © 2026 Zenze.fun · $ZNZF · v2.6.72
      </div>
    </footer>
  );
}
