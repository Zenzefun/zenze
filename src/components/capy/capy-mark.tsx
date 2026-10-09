import { SmartImage } from "@/components/media/smart-image";
import { cn } from "@/lib/utils";

/** Photoreal capybara disc — brand mark for header/footer. No token coin beside it. */
export function CapyMark({ className }: { className?: string }) {
  return (
    <SmartImage
      src="/brand/capy-mark-64.png?v=20260924b"
      alt="Zenzen"
      width={36}
      height={36}
      priority
      className={cn("token-disc size-9 bg-transparent object-cover", className)}
      rounded="full"
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-xl font-semibold tracking-tight text-stone", className)}>
      Zenzen
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
