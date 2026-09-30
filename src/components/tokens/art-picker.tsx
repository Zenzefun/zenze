import { useRef } from "react";
import { toast } from "sonner";
import { SmartImage } from "@/components/media/smart-image";
import { Label } from "@/components/ui/label";
import { fileToTokenArt } from "@/lib/image-art";
import { cn } from "@/lib/utils";

export function ArtPicker({
  value,
  onChange,
  size = "default",
}: {
  value: string;
  onChange: (src: string) => void;
  size?: "default" | "hero";
}) {
  const input = useRef<HTMLInputElement>(null);
  const hero = size === "hero";

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await fileToTokenArt(file);
      onChange(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  return (
    <div className="space-y-2">
      <Label className="block text-center sm:text-left">Token image</Label>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn(
            "relative shrink-0 overflow-hidden rounded-full border border-dashed border-border bg-card",
            hero ? "size-36 sm:size-40" : "size-20",
          )}
        >
          {value ? (
            <SmartImage
              src={value}
              alt=""
              width={hero ? 160 : 80}
              height={hero ? 160 : 80}
              className="absolute inset-0 size-full"
              rounded="full"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-muted-foreground">
              Upload
            </span>
          )}
        </button>
        <div className="flex w-full min-w-0 flex-col items-center sm:items-start">
          <p className="text-sm text-muted-foreground">PNG, JPG, or WebP. Shown as a circle.</p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            {value ? "Replace image" : "Upload token image"}
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
