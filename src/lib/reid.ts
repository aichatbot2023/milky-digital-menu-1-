/**
 * Re-identifikacija opasnosti kroz skenove — po uzoru na REMIND
 * (cvar-vision-dl/remind-reid-tracker, MIT): identitet objekta se ne pamti
 * po poziciji nego po IZGLEDU, uz kontekst suseda i globalnu (Hungarian)
 * dodelu, sa „provizornim" stanjem kada je poklapanje sporno.
 *
 * Razlika u odnosu na original: REMIND koristi DINOv3 embeding, što je
 * previše teško za telefon u browseru. Ovde je isti obrazac izveden nad
 * jeftinim deskriptorom koji se računa na canvas-u:
 *   - GLOBALNI izgled: HSV histogram celog isečka
 *   - DELOVI: isti histogram za 2×2 kvadranta (part-based descriptors)
 *   - GEOMETRIJA: odnos stranica, površina, položaj u kadru
 *   - KONTEKST: nazivi ostalih opasnosti u istom kadru (co-occurrence)
 * Sve radi offline, bez ijednog dodatnog megabajta modela.
 */
import type { Hazard, HazardBox } from "../types";

const H_BINS = 8;
const S_BINS = 3;
const V_BINS = 3;
const BINS = H_BINS * S_BINS * V_BINS; // 72 po regionu
const PARTS = 5; // ceo isečak + 2×2 kvadranta

export interface Descriptor {
  /** Histogrami: [globalni, gore-levo, gore-desno, dole-levo, dole-desno]. */
  hist: number[];
  aspect: number;
  area: number;
  cx: number;
  cy: number;
}

function rgbToHsvBin(r: number, g: number, b: number): number {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  const hb = Math.min(H_BINS - 1, Math.floor((h / 360) * H_BINS));
  const sb = Math.min(S_BINS - 1, Math.floor(s * S_BINS));
  const vb = Math.min(V_BINS - 1, Math.floor(v * V_BINS));
  return hb * S_BINS * V_BINS + sb * V_BINS + vb;
}

function histOf(data: Uint8ClampedArray, w: number, h: number, region: [number, number, number, number]): number[] {
  const [x0, y0, x1, y1] = region;
  const out = new Array(BINS).fill(0);
  let n = 0;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = (y * w + x) * 4;
      out[rgbToHsvBin(data[i], data[i + 1], data[i + 2])] += 1;
      n += 1;
    }
  }
  if (n > 0) for (let i = 0; i < BINS; i++) out[i] /= n;
  return out;
}

/** Deskriptor jednog isečka slike (mora se zvati sa učitanom slikom). */
function describeBox(
  data: Uint8ClampedArray,
  iw: number,
  ih: number,
  box: HazardBox,
): Descriptor {
  const x0 = Math.max(0, box.x * iw);
  const y0 = Math.max(0, box.y * ih);
  const x1 = Math.min(iw, (box.x + box.w) * iw);
  const y1 = Math.min(ih, (box.y + box.h) * ih);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const regions: [number, number, number, number][] = [
    [x0, y0, x1, y1],
    [x0, y0, mx, my],
    [mx, y0, x1, my],
    [x0, my, mx, y1],
    [mx, my, x1, y1],
  ];
  const hist: number[] = [];
  for (const r of regions) hist.push(...histOf(data, iw, ih, r));
  return {
    hist,
    aspect: box.h > 0 ? box.w / box.h : 1,
    area: box.w * box.h,
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
  };
}

/** Deskriptori svih opasnosti sa jedne fotografije (jedan prolaz kroz canvas). */
export async function extractDescriptors(
  imageDataUrl: string,
  hazards: Hazard[],
): Promise<Descriptor[]> {
  if (hazards.length === 0) return [];
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("slika"));
    el.src = imageDataUrl;
  });
  // Radi na smanjenoj kopiji — histogrami su otporni na skaliranje, a
  // obrada je trenutna i na starijem telefonu
  const scale = Math.min(1, 320 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return hazards.map(() => emptyDescriptor());
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return hazards.map((hz) => describeBox(data, w, h, hz.box));
}

export function emptyDescriptor(): Descriptor {
  return { hist: new Array(BINS * PARTS).fill(0), aspect: 1, area: 0, cx: 0.5, cy: 0.5 };
}

/** Presek histograma (0–1): koliko se izgled poklapa. */
function histIntersection(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return s / PARTS; // svaki region je zasebno normalizovan na 1
}

/** Adaptivni model: pamćenje se blago pomera ka novom viđenju (EMA). */
export function blendDescriptor(old: Descriptor, next: Descriptor, alpha = 0.3): Descriptor {
  if (old.hist.length !== next.hist.length) return next;
  return {
    hist: old.hist.map((v, i) => v * (1 - alpha) + next.hist[i] * alpha),
    aspect: old.aspect * (1 - alpha) + next.aspect * alpha,
    area: old.area * (1 - alpha) + next.area * alpha,
    cx: old.cx * (1 - alpha) + next.cx * alpha,
    cy: old.cy * (1 - alpha) + next.cy * alpha,
  };
}

export interface Candidate {
  label: string;
  category: string;
  desc: Descriptor;
  /** Nazivi ostalih opasnosti u istom kadru — relacioni kontekst. */
  context: string[];
}

/**
 * Ocena da su dva viđenja ISTI objekat (0–1). Sledi REMIND logiku:
 * izgled je glavni dokaz, delovi i geometrija razdvajaju slične predmete,
 * a kontekst suseda pomaže kada je izgled dvosmislen.
 */
export function identityScore(a: Candidate, b: Candidate): number {
  // Zaštita (post-assignment guard): različita kategorija = različit objekat
  if (a.category !== b.category) return 0;

  const appearance = histIntersection(a.desc.hist, b.desc.hist);
  const aspectSim =
    1 - Math.min(1, Math.abs(a.desc.aspect - b.desc.aspect) / Math.max(a.desc.aspect, b.desc.aspect, 0.2));
  const areaSim =
    1 - Math.min(1, Math.abs(a.desc.area - b.desc.area) / Math.max(a.desc.area, b.desc.area, 0.01));
  const sameLabel = a.label.toLowerCase() === b.label.toLowerCase() ? 1 : 0;
  const ctx = a.context.length && b.context.length
    ? a.context.filter((x) => b.context.includes(x)).length /
      Math.max(a.context.length, b.context.length)
    : 0;

  return (
    appearance * 0.45 +
    sameLabel * 0.25 +
    aspectSim * 0.1 +
    areaSim * 0.08 +
    ctx * 0.12
  );
}

/**
 * Hungarian algoritam (O(n³)) — globalno optimalna dodela umesto pohlepnog
 * uparivanja; sprečava da dva slična predmeta „ukradu" isti identitet.
 * Vraća za svaki red indeks kolone ili -1.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m0 = cost[0].length;
  const m = Math.max(n, m0);
  const INF = 1e9;
  const c = cost.map((row) => {
    const r = row.slice();
    while (r.length < m) r.push(INF);
    return r;
  });
  while (c.length < m) c.push(new Array(m).fill(INF));

  const u = new Array(m + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    const i = p[j];
    if (i >= 1 && i <= n && j - 1 < m0) assign[i - 1] = j - 1;
  }
  return assign;
}

/** Poklapanje je pouzdano iznad ovoga, sporno („provizorno") ispod. */
export const MATCH_STRONG = 0.62;
export const MATCH_WEAK = 0.45;

export interface Assignment {
  /** indeks u galeriji (-1 = nov objekat) */
  galleryIndex: number;
  score: number;
  /** true kada je poklapanje u spornoj zoni — REMIND „provisional" stanje */
  provisional: boolean;
}

/**
 * Globalno uparivanje novih nalaza sa zapamćenom galerijom.
 * Vraća po jedan rezultat za svaki novi nalaz.
 */
export function assignIdentities(
  fresh: Candidate[],
  gallery: Candidate[],
): Assignment[] {
  if (fresh.length === 0) return [];
  if (gallery.length === 0) {
    return fresh.map(() => ({ galleryIndex: -1, score: 0, provisional: false }));
  }
  const scores = fresh.map((f) => gallery.map((g) => identityScore(f, g)));
  const cost = scores.map((row) => row.map((s) => 1 - s));
  const assign = hungarian(cost);

  return fresh.map((_, i) => {
    const j = assign[i];
    const s = j >= 0 ? scores[i][j] : 0;
    if (j < 0 || s < MATCH_WEAK) return { galleryIndex: -1, score: s, provisional: false };
    return { galleryIndex: j, score: s, provisional: s < MATCH_STRONG };
  });
}
