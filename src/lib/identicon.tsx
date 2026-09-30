import { cn } from "@/lib/utils";

function hue(seed: string, salt: number) {
  const hex = seed.toLowerCase().replace(/^0x/, "").replace(/[^a-f0-9]/g, "") || "cafeba";
  const padded = (hex + "cafebabe").repeat(3);
  const n = Number.parseInt(padded.slice(salt * 2, salt * 2 + 6), 16);
  return Number.isFinite(n) ? n % 360 : 30;
}

/** Deterministic avatar from a wallet, contract, or token id — never the Zenze mark. */
export function AddressIdenticon({
  address,
  className,
  size,
}: {
  address: string;
  className?: string;
  size?: number;
}) {
  const a = hue(address, 0);
  const b = hue(address, 1);
  const c = hue(address, 2);
  return (
    <span
      className={cn("token-disc relative overflow-hidden rounded-full", className)}
      aria-hidden="true"
      style={{
        background: `hsl(${a} 42% 42%)`,
        ...(size
          ? {
              width: size,
              height: size,
              minWidth: size,
              minHeight: size,
              aspectRatio: "1 / 1",
              flex: "0 0 auto",
            }
          : null),
      }}
    >
      <span
        className="absolute inset-[-20%] rounded-full"
        style={{ background: `hsl(${b} 55% 52%)`, clipPath: "polygon(20% 0, 100% 30%, 70% 100%, 0 60%)" }}
      />
      <span
        className="absolute right-[-10%] bottom-[-20%] size-[70%] rounded-full"
        style={{ background: `hsl(${c} 48% 38%)` }}
      />
    </span>
  );
}
