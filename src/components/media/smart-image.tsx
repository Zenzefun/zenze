import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AddressIdenticon } from "@/lib/identicon";
import { displayTokenArt, isBrandTokenArt, isIpfsArt, publicTokenArt } from "@/lib/image-art";
import { isProtocolToken } from "@/lib/pool";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  rounded?: "full" | "xl" | "2xl" | "lg" | "none";
};

const ROUND = {
  full: "rounded-full",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  lg: "rounded-lg",
  none: "",
};

function hasBoxClass(className?: string) {
  return Boolean(className && /(?:^|\s)(?:size-|w-|h-|min-w-|min-h-|aspect-)/.test(className));
}

function hasHeightClass(className?: string) {
  return Boolean(className && /(?:^|\s)(?:h-|min-h-|size-|aspect-)/.test(className));
}

/** Sized image with a pulse skeleton until the file actually paints. */
export function SmartImage({
  src,
  alt = "",
  width,
  height,
  className,
  priority = false,
  rounded = "none",
}: Props) {
  const url = src.startsWith("data:") || src.startsWith("http") || src.startsWith("/") ? src : displayTokenArt(src);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const ref = useRef<HTMLImageElement>(null);
  const circle = rounded === "full";
  const sized = hasBoxClass(className);
  const disc = circle ? width : height;

  useEffect(() => {
    setStatus("loading");
    const el = ref.current;
    if (!el) return;
    if (el.complete) setStatus(el.naturalWidth > 0 ? "ready" : "error");
  }, [url]);

  const boxStyle: CSSProperties = circle
    ? sized
      ? { aspectRatio: "1 / 1", flex: "0 0 auto" }
      : {
          width: disc,
          height: disc,
          minWidth: disc,
          minHeight: disc,
          aspectRatio: "1 / 1",
          flex: "0 0 auto",
        }
    : sized
      ? hasHeightClass(className)
        ? {}
        : { aspectRatio: `${width} / ${height}`, width: "100%" }
      : { width, height, maxWidth: "100%" };

  return (
    <span
      className={cn(
        "relative overflow-hidden bg-muted/40",
        circle ? "token-disc" : "inline-block max-w-full",
        ROUND[rounded],
        className,
      )}
      style={boxStyle}
    >
      {status === "loading" && (
        <span className={cn("absolute inset-0 animate-pulse bg-muted", ROUND[rounded])} aria-hidden />
      )}
      {status === "error" && <span className={cn("absolute inset-0 bg-muted", ROUND[rounded])} aria-hidden />}
      <img
        ref={ref}
        src={url}
        alt={alt}
        width={circle ? disc : width}
        height={circle ? disc : height}
        decoding={priority ? "sync" : "async"}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "low"}
        draggable={false}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
        className={cn(
          "absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300",
          ROUND[rounded],
          status === "ready" ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}

export function TokenImage({
  src,
  alt = "",
  size,
  priority = false,
  className,
  seed,
  protocol,
}: {
  src: string;
  alt?: string;
  size: number;
  priority?: boolean;
  className?: string;
  seed?: string;
  protocol?: boolean;
}) {
  const keepBrand = protocol || isProtocolToken({ id: seed, symbol: alt });
  const url = publicTokenArt(src, keepBrand);
  const show =
    Boolean(url) &&
    (keepBrand || isIpfsArt(url) || url.startsWith("data:image/") || (!isBrandTokenArt(url) && url.startsWith("http")));
  const disc = cn("token-disc bg-transparent", className);
  if (!show) {
    return <AddressIdenticon address={seed || src || alt || "token"} className={disc} size={size} />;
  }
  return (
    <SmartImage
      src={url}
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      rounded="full"
      className={disc}
    />
  );
}
