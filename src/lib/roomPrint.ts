/**
 * Otisak prostora iz jedne fotografije.
 *
 * Prostor se prepoznaje po tome šta u njemu stoji i koje su mu boje. Šta
 * stoji već znamo — detektor je upravo prošao kroz kadar i svaka opasnost
 * nosi ime predmeta na kome je nađena. Boje se čitaju iz same slike.
 *
 * Namerno se ne pamti sama fotografija, samo ovih nekoliko brojeva. Prostor
 * u kome neko živi ne treba nam u memoriji duže nego što mora.
 */
import type { Hazard } from "../types";
import type { RoomPrint } from "./roomMemory";

/** Radna širina čitanja boja — više od ovoga ne menja paletu. */
const WORK = 96;

/**
 * Vodeće boje slike.
 *
 * Boje se grubo grupišu (po 32 nijanse), pa se uzimaju najčešće grupe. Tako
 * drugačije osvetljenje ne pravi drugu paletu, a druga soba pravi.
 */
function palette(img: HTMLImageElement): string[] {
  const w = Math.min(WORK, img.naturalWidth || WORK);
  const h = Math.max(1, Math.round(((img.naturalHeight || WORK) / (img.naturalWidth || WORK)) * w));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);

  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return [];
  }

  const bins = new Map<number, number>();
  for (let i = 0; i < px.length; i += 4) {
    const key = ((px[i] >> 5) << 10) | ((px[i + 1] >> 5) << 5) | (px[i + 2] >> 5);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  return [...bins.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const r = ((key >> 10) & 31) * 8 + 4;
      const g = ((key >> 5) & 31) * 8 + 4;
      const b = (key & 31) * 8 + 4;
      return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    });
}

export function roomPrint(imageDataUrl: string, hazards: Hazard[]): Promise<RoomPrint | null> {
  const objects = hazards
    .map((h) => h.sourceClass || h.label)
    .filter(Boolean)
    .map((s) => s.toLowerCase());

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const colours = palette(img);
      // Bez ijednog predmeta i bez boja nema šta da se pamti.
      resolve(objects.length || colours.length ? { objects, palette: colours } : null);
    };
    img.onerror = () => resolve(objects.length ? { objects, palette: [] } : null);
    img.src = imageDataUrl;
  });
}
