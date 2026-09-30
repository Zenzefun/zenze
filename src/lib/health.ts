export type HealthBand = {
  key: "calm" | "warm" | "cold" | "storm";
  label: string;
  hint: string;
  className: string;
  barClass: string;
};

export function healthBand(score: number): HealthBand {
  if (score >= 80) {
    return {
      key: "calm",
      label: "Calm Pool",
      hint: "Liquidity sits still. Capy would nap here.",
      className: "bg-moss/15 text-moss",
      barClass: "bg-moss",
    };
  }
  if (score >= 60) {
    return {
      key: "warm",
      label: "Warm Spring",
      hint: "Gentle current. Watch the rocks, not the ripples.",
      className: "bg-steam/40 text-stone",
      barClass: "bg-steam",
    };
  }
  if (score >= 40) {
    return {
      key: "cold",
      label: "Cold River",
      hint: "Choppy. Size down and wait for the steam to settle.",
      className: "bg-sand text-stone",
      barClass: "bg-stone/50",
    };
  }
  return {
    key: "storm",
    label: "Stormy Water",
    hint: "Capy stays on the bank. Do not rush this pool.",
    className: "bg-blossom/25 text-destructive",
    barClass: "bg-blossom",
  };
}

/** Health and rug posture from live curve / holder facts — not seeded labels. */
export function computeHealth(input: {
  realBase: number;
  holders: number;
  topShare: number;
  volumeNative24h: number;
}): { health: number; rug: number } {
  const liq = Math.min(40, (Math.max(0, input.realBase) / 24) * 40);
  const hold = Math.min(25, (Math.log10(Math.max(input.holders, 0) + 1) / Math.log10(500)) * 25);
  const dist = Math.min(20, Math.max(0, 1 - Math.min(1, Math.max(0, input.topShare))) * 20);
  const vol = Math.min(15, Math.max(0, input.volumeNative24h) * 2);
  const health = Math.round(Math.max(8, Math.min(99, liq + hold + dist + vol)));
  const rug = Math.round(
    Math.max(2, Math.min(85, 8 + Math.min(1, Math.max(0, input.topShare)) * 55 - Math.min(18, input.holders * 1.5))),
  );
  return { health, rug };
}
