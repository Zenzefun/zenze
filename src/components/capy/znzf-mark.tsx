import { SmartImage } from "@/components/media/smart-image";
import { cn } from "@/lib/utils";

/** $ZNZF mark is the same capy disc as the header. */
export function ZnzfMark({ className }: { className?: string }) {
  return (
    <SmartImage
      src="/brand/capy-mark-64.png"
      alt="$ZNZF"
      width={128}
      height={128}
      className={cn("size-7 shrink-0 rounded-full bg-transparent object-cover", className)}
      rounded="full"
    />
  );
}
