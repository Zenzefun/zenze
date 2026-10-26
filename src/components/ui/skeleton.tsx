import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Row placeholders shaped like the token list, not a single blank bar. */
export function TokenListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-hidden>
      <ul className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-36 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="hidden w-16 space-y-2 sm:block">
              <Skeleton className="ml-auto h-3 w-12" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
            <Skeleton className="h-2 w-24 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
