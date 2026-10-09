import { SITE } from "@/lib/seo";
import { neutralizeBareDomain } from "@/lib/x-url";
import { Button } from "@/components/ui/button";

export function shareUrl(path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${clean === "/" ? "" : clean}`;
}

export function xIntent(text: string, _path: string) {
  const u = new URL("https://x.com/intent/tweet");
  u.searchParams.set("text", neutralizeBareDomain(text));
  u.searchParams.set("url", shareUrl(_path || "/"));
  return u.toString();
}

export function ShareX({
  text,
  path,
  label = "Share on X",
  size = "default",
}: {
  text: string;
  path: string;
  label?: string;
  size?: "sm" | "default";
}) {
  return (
    <Button asChild variant="outline" size={size}>
      <a href={xIntent(text, path)} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </Button>
  );
}