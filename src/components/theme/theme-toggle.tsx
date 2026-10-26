import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="relative grid size-11 place-items-center rounded-full border border-border bg-card text-foreground transition-[background-color,border-color,transform] duration-300 ease-soft hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
    >
      <span className="relative size-4">
        <Sun
          className={cn(
            "absolute inset-0 size-4 transition-[opacity,transform] duration-500 ease-soft",
            dark ? "scale-[0.82] opacity-0" : "scale-100 opacity-100",
          )}
        />
        <Moon
          className={cn(
            "absolute inset-0 size-4 transition-[opacity,transform] duration-500 ease-soft",
            dark ? "scale-100 opacity-100" : "scale-[0.82] opacity-0",
          )}
        />
      </span>
    </button>
  );
}
