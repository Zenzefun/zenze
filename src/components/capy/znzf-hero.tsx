import { cn } from "@/lib/utils";

/** Rebrand hero: the Capy mark, gold on ink, on a soft halo with slow orbit rings. Pure SVG + CSS. */
export function ZnzfHero({ className }: { className?: string }) {
  return (
    <div className={cn("capy-hero", className)} role="img" aria-label="Zenzen capybara mark">
      <div className="capy-hero-glow" aria-hidden />
      <svg viewBox="0 0 400 400" className="capy-hero-rings" aria-hidden>
        <circle cx="200" cy="200" r="150" />
        <circle cx="200" cy="200" r="182" strokeDasharray="2 10" />
        <circle cx="350" cy="200" r="4" className="capy-hero-dot" />
      </svg>
      <svg viewBox="40 130 432 280" className="capy-hero-mark" aria-hidden>
        <circle cx="226" cy="186" r="38" fill="var(--color-gold)" />
        <rect x="56" y="180" width="400" height="216" rx="108" fill="var(--color-gold)" />
        <circle cx="362" cy="250" r="17" fill="#0a0a0b" className="capy-hero-eye" />
      </svg>
    </div>
  );
}
