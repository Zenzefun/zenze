import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { SmartImage } from "@/components/media/smart-image";
import { HomeButton } from "@/components/site/home-button";
import { Button } from "@/components/ui/button";

function StealthHead() {
  useEffect(() => {
    document.title = "Zenzen";
    const robots = document.querySelector('meta[name="robots"]');
    if (robots) {
      robots.setAttribute("content", "noindex,nofollow,noarchive,nosnippet,noimageindex");
    } else {
      const meta = document.createElement("meta");
      meta.name = "robots";
      meta.content = "noindex,nofollow,noarchive,nosnippet,noimageindex";
      document.head.appendChild(meta);
    }
  }, []);
  return null;
}

export function PublicNotFound() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 text-center">
      <StealthHead />
      <div className="steam-veil pointer-events-none absolute inset-0" />
      <div className="relative max-w-md page-enter">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone stagger-item">404</p>
        <SmartImage
          src="/brand/capy-zen.webp"
          alt="Capy sitting on a river rock"
          width={640}
          height={480}
          className="mx-auto mt-4 w-56 rounded-2xl object-cover capy-bob"
          rounded="2xl"
        />
        <h1 className="mt-6 font-display text-3xl font-semibold stagger-item" style={{ animationDelay: "80ms" }}>
          This pool ran dry
        </h1>
        <p
          className="mt-3 text-sm leading-relaxed text-muted-foreground stagger-item"
          style={{ animationDelay: "160ms" }}
        >
          That path is not on Zenzen. The river still runs — head home or pick a live pool.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 stagger-item" style={{ animationDelay: "240ms" }}>
          <HomeButton />
          <Button asChild variant="outline">
            <Link to="/explore">Explore pools</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
