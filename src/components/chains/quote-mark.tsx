import { SmartImage } from "@/components/media/smart-image";
import { cn } from "@/lib/utils";
import { quoteLogoPath } from "@/lib/pairs";

/** Listed-asset marks from CoinGecko / CoinMarketCap. Not generated geometry. */
export function QuoteMark({ quote, className }: { quote: string; className?: string }) {
  return (
    <SmartImage
      src={`${quoteLogoPath(quote)}?v=8`}
      alt=""
      width={40}
      height={40}
      className={cn("size-5 shrink-0 rounded-full bg-transparent object-contain", className)}
      rounded="full"
    />
  );
}
