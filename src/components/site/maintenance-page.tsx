import { SmartImage } from "@/components/media/smart-image";
import { Button } from "@/components/ui/button";
import { HomeButton } from "@/components/site/home-button";
import { SITE } from "@/lib/seo";

export function MaintenancePage({ message }: { message?: string }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 text-center">
      <div className="steam-veil pointer-events-none absolute inset-0" />
      <div className="relative max-w-sm page-enter">
        <SmartImage
          src="/brand/capy-sleep.webp"
          alt=""
          width={320}
          height={240}
          className="mx-auto w-52 rounded-2xl object-cover capy-bob"
          rounded="2xl"
        />
        <h1 className="mt-6 font-display text-3xl font-semibold stagger-item">The onsen is closed</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground stagger-item" style={{ animationDelay: "80ms" }}>
          {message?.trim() || "Capy is soaking. Zenze.fun will open again when the water settles."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3 stagger-item" style={{ animationDelay: "160ms" }}>
          <HomeButton />
          <Button asChild variant="outline">
            <a href={SITE.x} target="_blank" rel="noopener noreferrer">
              Follow us on X
            </a>
          </Button>
        </div>
      </div>
    </main>
  );
}
