import { cn } from "@/lib/utils";

/** Capy mark (rebrand 2026-10): one pill head, ear, dot eye. Gold body; eye uses the page background. */
export function CapyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="40 130 432 280" role="img" aria-label="Zenzen" className={cn("h-9 w-auto", className)}>
      <circle cx="226" cy="186" r="38" fill="var(--color-gold)" />
      <rect x="56" y="180" width="400" height="216" rx="108" fill="var(--color-gold)" />
      <circle cx="362" cy="250" r="17" fill="var(--color-background)" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-xl font-semibold tracking-[-0.03em] text-foreground", className)}>
      zenzen
    </span>
  );
}

/** Header/footer lockup: one mascot + wordmark. $ZNZF coin lives on token surfaces only. */
export function BrandLockup({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <CapyMark className={cn("size-8 sm:size-9", markClassName)} />
      {showWordmark && <Wordmark className={wordmarkClassName} />}
    </span>
  );
}
