import { SITE } from "@/lib/seo";
import { neutralizeBareDomain } from "@/lib/x-url";
import { Button } from "@/components/ui/button";
import { ZENZEN_LINKS } from "@/lib/socials";

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
  variant = "outline",
}: {
  text: string;
  path: string;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "gold";
}) {
  return (
    <Button asChild variant={variant} size={size}>
      <a href={xIntent(text, path)} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </Button>
  );
}
/** X + Telegram share pair (zenzen.fun links). */
export function ShareButtons({ text, path, size = "sm" }: { text: string; path: string; size?: "sm" | "default" }) {
  const url = shareUrl(path || "/");
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ShareX text={text} path={path} size={size} variant="gold" label="Share on X 🌿" />
      <Button asChild variant="outline" size={size}>
        <a href={tg} target="_blank" rel="noopener noreferrer">Telegram</a>
      </Button>
      <span className="sr-only">Community: {ZENZEN_LINKS.telegram}</span>
    </div>
  );
}
