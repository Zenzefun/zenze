import { useEffect } from "react";

const MAX_MS = 1200;

function hideBoot() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.classList.contains("capy-ready")) return;
  root.classList.add("capy-ready");
  const boot = document.getElementById("capy-boot");
  if (!boot) return;
  window.setTimeout(() => boot.classList.add("is-gone"), 280);
}

function paintBootImage() {
  const img = document.querySelector<HTMLImageElement>("#capy-boot img");
  if (!img) return;
  const on = () => img.classList.add("on");
  if (img.complete && img.naturalWidth > 0) on();
  else {
    img.addEventListener("load", on, { once: true });
    img.addEventListener(
      "error",
      () => {
        if (!img.src.includes("capy-mark-64")) img.src = "/brand/capy-mark-64.png?v=20260924b";
        else on();
      },
      { once: true },
    );
  }
}

/** Backup hide if the inline boot script missed load. Never re-shows the overlay. */
export function CapyPreloader() {
  useEffect(() => {
    paintBootImage();
    if (document.readyState === "complete") hideBoot();
    else window.addEventListener("load", hideBoot, { once: true });
    const maxTimer = window.setTimeout(hideBoot, MAX_MS);
    return () => window.clearTimeout(maxTimer);
  }, []);

  return null;
}
