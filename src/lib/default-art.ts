/**
 * Default token image when the creator skips the upload: a 512px JPEG with the ticker
 * on a gradient picked from the ticker, so every token still has distinct art.
 * Browser only (canvas). Returns "" on the server or if canvas is unavailable.
 */
const PALETTES: Array<[string, string]> = [
  ["#f5b544", "#c2410c"],
  ["#34d399", "#0f766e"],
  ["#60a5fa", "#4338ca"],
  ["#f472b6", "#9d174d"],
  ["#a78bfa", "#5b21b6"],
  ["#facc15", "#65a30d"],
  ["#fb7185", "#b45309"],
  ["#22d3ee", "#1d4ed8"],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function defaultTokenArt(symbol: string, name = ""): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const [a, b] = PALETTES[hash(`${symbol}|${name}`) % PALETTES.length]!;
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(400, 110, 150, 0, Math.PI * 2);
  ctx.fill();
  const label = (symbol || "TOKEN").toUpperCase().slice(0, 8);
  const size = label.length <= 3 ? 200 : label.length <= 5 ? 140 : 96;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(label, 256, 270);
  return canvas.toDataURL("image/jpeg", 0.9);
}
