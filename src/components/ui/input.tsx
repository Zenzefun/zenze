import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      suppressHydrationWarning
      className={cn(
        "flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground caret-current shadow-none transition-colors duration-300 ease-soft placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-gold/35 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
