import { SmartImage } from "@/components/media/smart-image";
import { HomeButton } from "@/components/site/home-button";
import { Button } from "@/components/ui/button";

export function QueryError({
  onRetry,
  message = "The river could not be reached. Try again.",
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      <SmartImage
        src="/brand/capy-sleep.webp"
        alt="Capy asleep on the bank"
        width={160}
        height={160}
        className="mx-auto w-40 rounded-xl"
        rounded="xl"
      />
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <HomeButton />
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
