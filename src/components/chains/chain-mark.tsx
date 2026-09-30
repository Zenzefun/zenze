import { SmartImage } from "@/components/media/smart-image";
import { cn } from "@/lib/utils";
import type { ChainKey } from "@/lib/chains";

export { QuoteMark } from "./quote-mark";

const CHAIN_LOGO: Record<ChainKey, { src: string; alt: string }> = {
  robinhood: { src: "/chains/robinhood.jpg", alt: "Robinhood Chain" },
  arc: { src: "/chains/arc.svg", alt: "Arc" },
};

/** Official chain logomarks: Robinhood Chain feather (brand kit) and Arc arch (arc.io). */
export function ChainMark({ chain, className }: { chain: ChainKey; className?: string }) {
  const logo = CHAIN_LOGO[chain];
  return (
    <SmartImage
      src={`${logo.src}?v=3`}
      alt=""
      width={40}
      height={40}
      className={cn(
        "size-5 shrink-0 rounded-full bg-transparent object-contain ring-1 ring-border/50",
        className,
      )}
      rounded="full"
    />
  );
}
