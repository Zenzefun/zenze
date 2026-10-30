import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const LINES = [
  "The pool opens the moment you launch.",
  "Buyers and sellers trade it there until the curve fills.",
];

/**
 * Large benefit line below the hero. Each word brightens as it crosses a
 * trigger line. The scroll handler is throttled through requestAnimationFrame.
 */
export function TaglineReveal({ className }: { className?: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const words = [...root.querySelectorAll<HTMLElement>(".tagline-word")];
    let frame = 0;
    const tick = () => {
      frame = 0;
      const line = window.innerHeight * 0.72;
      for (const word of words) {
        if (word.classList.contains("is-on")) continue;
        if (word.getBoundingClientRect().top < line) word.classList.add("is-on");
      }
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section ref={ref} aria-label="Why Zenzen" className={cn("mx-auto max-w-[680px] px-4 py-10 sm:py-20", className)}>
      {LINES.map((line, lineIndex) => {
        const offset = LINES.slice(0, lineIndex).reduce((count, item) => count + item.split(" ").length, 0);
        const words = line.split(" ");
        return (
          <p key={line} className={cn("text-2xl font-semibold text-balance sm:text-5xl", lineIndex > 0 && "mt-3")}>
            {words.map((word, wordIndex) => (
              <span
                key={`${lineIndex}-${wordIndex}`}
                className="tagline-word"
                style={{ transitionDelay: `${Math.min((offset + wordIndex) * 45, 400)}ms` }}
              >
                {word}
                {wordIndex < words.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        );
      })}
    </section>
  );
}
