import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function HomeButton({
  variant = "gold",
  label = "Back home",
}: {
  variant?: "gold" | "outline" | "secondary";
  label?: string;
}) {
  return (
    <Button asChild variant={variant}>
      <Link to="/">{label}</Link>
    </Button>
  );
}
