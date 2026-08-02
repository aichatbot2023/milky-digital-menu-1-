/**
 * Lokalni vid — isti YOLOv8n koji SafeNest već koristi, ovde u službi
 * enterijera. Model je spakovan u `public/model/yolo/`, radi u browseru,
 * bez ijednog mrežnog poziva i bez troška.
 *
 * Zašto lokalni detektor uz oblak, a ne umesto njega:
 *   • YOLO vidi ŠTA je u kadru trenutno (30 puta brže od oblaka) — po tome
 *     odmah znamo tip prostorije, razmeru i gde je prazan zid;
 *   • oblak posle toga daje ono što YOLO ne zna: stil, raspoloženje i
 *     tačniju paletu.
 * Rezultat: kupac vidi predloge u prvoj sekundi, a oni se dotere kada
 * stigne dubinska analiza.
 */
import type { YoloPrediction } from "../lib/yolo";
import type { RoomProfile } from "./api";

export type { YoloPrediction };

/** Klase koje uopšte nose značenje za enterijer; ostalo se ne crta. */
const KEEP = new Set([
  "couch", "chair", "bed", "dining table", "tv", "potted plant", "vase",
  "clock", "book", "laptop", "refrigerator", "oven", "microwave", "sink",
  "toilet", "toaster", "keyboard", "mouse", "remote", "cup", "bowl",
  "bottle", "wine glass", "teddy bear", "person",
]);

/** Osoba se ne prikazuje kao komad nameštaja, ali je odlična mera. */
const HIDDEN = new Set(["person"]);

/**
 * Prava širina predmeta u centimetrima. Odavde se računa razmera kadra:
 * ako kauč zauzima 640 piksela, a kauč je ~200 cm, onda je 1 px ≈ 0,31 cm.
 */
const REAL_WIDTH_CM: Record<string, number> = {
  couch: 200, bed: 160, "dining table": 150, chair: 50, tv: 110,
  refrigerator: 70, oven: 60, microwave: 50, sink: 60, toilet: 38,
  "potted plant": 40, laptop: 33, keyboard: 44, book: 15, vase: 18,
  clock: 30, "teddy bear": 30, cup: 9, bowl: 16, bottle: 8,
  "wine glass": 8, toaster: 28, person: 45,
};

/** Koliko verujemo pojedinoj klasi kao merilu (veliko i standardno = bolje). */
const SIZE_TRUST: Record<string, number> = {
  couch: 1, bed: 0.95, "dining table": 0.9, refrigerator: 0.85, tv: 0.8,
  toilet: 0.8, oven: 0.75, chair: 0.7, sink: 0.7, person: 0.65,
  microwave: 0.6, laptop: 0.55, keyboard: 0.5, "potted plant": 0.35,
  clock: 0.3, vase: 0.25, book: 0.2,
};

/** Glasovi za tip prostorije — pobeđuje zbir, ne prva viđena stvar. */
const ROOM_VOTES: Record<string, [string, number][]> = {
  couch: [["living room", 3]],
  tv: [["living room", 2], ["bedroom", 0.5]],
  bed: [["bedroom", 4]],
  "dining table": [["dining room", 2.5], ["kitchen", 1]],
  chair: [["dining room", 1], ["office", 0.6]],
  refrigerator: [["kitchen", 3]],
  oven: [["kitchen", 3]],
  microwave: [["kitchen", 2.5]],
  toaster: [["kitchen", 2]],
  sink: [["kitchen", 1.5], ["bathroom", 1.5]],
  toilet: [["bathroom", 4]],
  laptop: [["office", 2]],
  keyboard: [["office", 2]],
  mouse: [["office", 1.5]],
  "teddy bear": [["nursery", 2]],
  "potted plant": [["living room", 0.5]],
  book: [["office", 0.5], ["living room", 0.3]],
};

let modelPromise: Promise<any> | null = null;

/** Model se učitava jednom po sesiji; drugo otvaranje kamere je trenutno. */
export function loadDetector(): Promise<any> {
  if (!modelPromise) {
    modelPromise = import("../lib/yolo")
      .then((m) => m.YoloModel.load())
      .catch((e) => {
        modelPromise = null;
        throw e;
      });
  }
  return modelPromise;
}

export interface Seen {
  label: string;
  score: number;
  /** Piksel-koordinate u prostoru izvornog kadra. */
  box: [number, number, number, number];
  hidden: boolean;
}

/** Zadrži samo ono što ima smisla u enterijeru i odbaci dvostruke nalaze. */
export function keepUseful(preds: YoloPrediction[]): Seen[] {
  return preds
    .filter((p) => KEEP.has(p.class) && p.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((p) => ({ label: p.class, score: p.score, box: p.bbox, hidden: HIDDEN.has(p.class) }));
}

/** Tip prostorije iz onoga što je u kadru. */
export function roomFrom(seen: Seen[]): { room: string; confidence: number } {
  const score: Record<string, number> = {};
  for (const s of seen) {
    for (const [room, w] of ROOM_VOTES[s.label] ?? []) {
      score[room] = (score[room] ?? 0) + w * s.score;
    }
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!best) return { room: "other", confidence: 0 };
  const total = Object.values(score).reduce((a, b) => a + b, 0);
  return { room: best[0], confidence: Math.min(0.9, best[1] / Math.max(1, total)) };
}

/**
 * Razmera kadra iz poznatih predmeta. Uzima se medijana svih procena,
 * ponderisana poverenjem u klasu — jedan pogrešno prepoznat predmet ne sme
 * da pomeri celu meru.
 */
export function scaleFrom(seen: Seen[], frameW: number): { wallWidth: number; wallHeight: number } | null {
  const est: { cmPerPx: number; w: number }[] = [];
  for (const s of seen) {
    const real = REAL_WIDTH_CM[s.label];
    const trust = SIZE_TRUST[s.label] ?? 0;
    const px = s.box[2];
    if (!real || trust < 0.25 || px < 24) continue;
    // Predmet zasečen ivicom kadra nije merodavan
    if (s.box[0] <= 2 || s.box[0] + px >= frameW - 2) continue;
    est.push({ cmPerPx: real / px, w: trust * s.score });
  }
  if (!est.length) return null;
  est.sort((a, b) => a.cmPerPx - b.cmPerPx);
  const half = est.reduce((a, e) => a + e.w, 0) / 2;
  let acc = 0;
  let cmPerPx = est[Math.floor(est.length / 2)].cmPerPx;
  for (const e of est) {
    acc += e.w;
    if (acc >= half) {
      cmPerPx = e.cmPerPx;
      break;
    }
  }
  const wallWidth = Math.round(frameW * cmPerPx);
  if (wallWidth < 60 || wallWidth > 1200) return null;
  // Visina plafona se ne vidi u kadru — uzima se uobičajenih 250 cm
  return { wallWidth, wallHeight: 250 };
}

/**
 * Najveći prazan pravougaonik u gornjem delu kadra = zid na koji komad ide.
 * Gruba mreža 12×8 je dovoljna, a računa se za par mikrosekundi.
 */
export function freeWall(seen: Seen[], w: number, h: number) {
  const COLS = 12;
  const ROWS = 8;
  const busy: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (const s of seen) {
    const [x, y, bw, bh] = s.box;
    const c0 = Math.max(0, Math.floor((x / w) * COLS));
    const c1 = Math.min(COLS - 1, Math.floor(((x + bw) / w) * COLS));
    const r0 = Math.max(0, Math.floor((y / h) * ROWS));
    const r1 = Math.min(ROWS - 1, Math.floor(((y + bh) / h) * ROWS));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) busy[r][c] = true;
  }
  // Najveći pravougaonik jedinica — klasična histogramska metoda po redovima
  const heights = Array(COLS).fill(0);
  let best = { area: 0, r: 0, c: 0, w: 0, h: 0 };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) heights[c] = busy[r][c] ? 0 : heights[c] + 1;
    for (let c = 0; c < COLS; c++) {
      if (!heights[c]) continue;
      let minH = heights[c];
      for (let c2 = c; c2 < COLS; c2++) {
        minH = Math.min(minH, heights[c2]);
        if (!minH) break;
        const area = minH * (c2 - c + 1);
        // Gornji deo kadra ima prednost: tamo se kače slike i lampe
        const bonus = r - minH + 1 < ROWS / 2 ? 1.25 : 1;
        if (area * bonus > best.area) {
          best = { area: area * bonus, r: r - minH + 1, c, w: c2 - c + 1, h: minH };
        }
      }
    }
  }
  if (!best.area) return { x: 0.3, y: 0.2, w: 0.4, h: 0.4 };
  return {
    x: best.c / COLS,
    y: best.r / ROWS,
    w: best.w / COLS,
    h: best.h / ROWS,
  };
}

/**
 * Paleta prostorije iz samog kadra — bez modela. Boje se svode na grubu
 * mrežu i broje; uzimaju se četiri najčešća tona koja nisu skoro crna.
 */
export function paletteFrom(ctx: CanvasRenderingContext2D, w: number, h: number): string[] {
  const { data } = ctx.getImageData(0, 0, w, h);
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r + g + b < 60 || r + g + b > 730) continue;
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    bins.set(key, e);
  }
  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((e) => {
      const hex = (v: number) => Math.round(v / e.n).toString(16).padStart(2, "0");
      return `#${hex(e.r)}${hex(e.g)}${hex(e.b)}`;
    });
}

/**
 * Brzi profil prostora SAMO iz lokalnog vida — dovoljan da preporuke
 * krenu odmah. Stil se namerno ne pogađa: to je posao oblaka, a pogrešno
 * pogođen stil bi pokvario rangiranje.
 */
export function localProfile(
  seen: Seen[],
  frameW: number,
  frameH: number,
  palette: string[],
): RoomProfile {
  const { room, confidence } = roomFrom(seen);
  const scale = scaleFrom(seen, frameW);
  return {
    roomType: room,
    style: "contemporary",
    lighting: "soft natural",
    dominantColors: palette,
    materials: [],
    wallWidth: scale?.wallWidth ?? 300,
    wallHeight: scale?.wallHeight ?? 250,
    mood: "",
    recommendedSizes: [],
    focalPoint: freeWall(seen, frameW, frameH),
    notes: "",
    confidence: Math.min(0.55, confidence),
  };
}

/** Otisak scene — po njemu se zna da li se kadar zaista promenio. */
export function signature(seen: Seen[]): string {
  const counts: Record<string, number> = {};
  for (const s of seen) if (!s.hidden) counts[s.label] = (counts[s.label] ?? 0) + 1;
  return Object.keys(counts)
    .sort()
    .map((k) => `${k}${counts[k]}`)
    .join("|");
}
