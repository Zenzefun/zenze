import type { ReactNode } from "react";
import { SmartImage } from "@/components/media/smart-image";
import { cn } from "@/lib/utils";

/** Composed empty view: what is missing, and the next thing to do. */
export function EmptyState({
  title,
  body,
  actions,
  image = true,
  className,
}: {
  title: string;
  body: string;
  actions?: ReactNode;
  image?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card px-6 py-10 text-center", className)}>
      {image ? (
        <SmartImage src="/brand/capy-sleep.webp" alt="" width={160} height={160} className="mx-auto w-32 rounded-xl" rounded="xl" />
      ) : null}
      <h2 className={cn("text-xl font-semibold text-balance", image && "mt-4")}>{title}</h2>
      <p className="mt-2 text-sm text-pretty text-muted-foreground">{body}</p>
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
