import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const RIMS = 20;

/** Same $ZNZF disc as the header — presented as two 3D coins, not a new drawing. */
export function ZnzfHero({ className }: { className?: string }) {
  return (
    <div className={cn("znzf-stage", className)} role="img" aria-label="$ZNZF — zen capybara coin">
      <div className="znzf-stage-bg" />
      <ZnzfCoin className="znzf-coin-a" priority />
      <ZnzfCoin className="znzf-coin-b" />
      <div className="znzf-stage-glow" />
    </div>
  );
}

function ZnzfCoin({ className, priority = false }: { className?: string; priority?: boolean }) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth > 0) setReady(true);
  }, []);
  return (
    <div className={cn("znzf-coin", className)}>
      <div className="znzf-coin-3d">
        {Array.from({ length: RIMS }, (_, i) => (
          <span key={i} className="znzf-coin-rim" style={{ transform: `translateZ(${-i * 0.95}px)` }} />
        ))}
        {!ready && <span className="znzf-coin-face animate-pulse bg-muted" aria-hidden />}
        <img
          ref={ref}
          src="/brand/capy-mark-512.webp"
          alt=""
          width={512}
          height={512}
          decoding={priority ? "sync" : "async"}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "low"}
          draggable={false}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
          className="znzf-coin-face"
          style={{ opacity: ready ? 1 : 0, transition: "opacity 300ms" }}
        />
        <span className="znzf-coin-shine" />
      </div>
    </div>
  );
}
