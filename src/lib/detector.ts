/**
 * Lokalna (in-browser) detekcija objekata — YOLOv8n (primarno) / COCO-SSD (rezerva).
 * Model je SPAKOVAN U APLIKACIJU (public/model/) i služi se sa istog domena
 * kao i sajt — NEMA spoljnih preuzimanja u runtime-u, nema šta da padne.
 * WebGL ubrzanje na telefonu, bez API poziva — besplatno i neograničeno.
 *
 * PRECIZNOST: SSD model interno smanjuje ulaz na 300×300 px, pa sitni
 * predmeti "nestanu". Zato radimo VIŠESLOJNU (pločastu) detekciju po uzoru
 * na SAHI tehniku: pored celog kadra, model gleda i UVELIČANE delove slike
 * (pločice), a rezultati se spajaju NMS algoritmom (uklanjanje duplikata
 * po preklapanju). Sitan predmet koji je na celom kadru 4 piksela, na
 * pločici je 12+ — i model ga vidi.
 */
import type { AgeGroup, Hazard, HazardBox } from "../types";
import { mapDetectionsToHazards, type Detection } from "./hazardKnowledge";
import { thresholdAdjustment } from "./learning";
import { judgeByContext } from "./context";
import { isPet } from "./domain";
import { detectHazards, preloadHazardModel } from "./hazardModel";

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

interface CocoModel {
  detect(
    source: Source,
    maxNumBoxes?: number,
    minScore?: number,
  ): Promise<{ bbox: [number, number, number, number]; class: string; score: number }[]>;
}

const MAX_BOXES = 30;
// Detekcija ide sa NISKIM osnovnim pragom, a zatim se filtrira PO KLASI:
// sitni opasni predmeti (nož, makaze, daljinski...) prolaze već sa malim
// poverenjem, dok krupni nameštaj traži visoko poverenje da ne pravi šum.
const RAW_THRESHOLD = 0.18;
const DEFAULT_MIN = 0.35;
const CLASS_MIN: Record<string, number> = {
  // Sitni/opasni — maksimalna osetljivost (roditelj radije da vidi višak)
  knife: 0.22, scissors: 0.22, fork: 0.25, spoon: 0.3, remote: 0.25,
  "cell phone": 0.28, bottle: 0.28, tie: 0.25, "hair drier": 0.25,
  "teddy bear": 0.3, handbag: 0.3, backpack: 0.3, umbrella: 0.3,
  "hot dog": 0.3, apple: 0.32, orange: 0.32, carrot: 0.32,
  // Klase koje model ČESTO POGREŠNO vidi na dečjoj opremi — vrlo strog prag:
  // bebeća kolica ume da nazove "kofer", bebeću flašicu "čašom/šoljom"
  suitcase: 0.62, "wine glass": 0.5, cup: 0.5, vase: 0.5,
  // Klase koje model brka sa PLAFONJERAMA/lampama/detektorima — vrlo strogo
  frisbee: 0.65, kite: 0.6, "sports ball": 0.45, clock: 0.5,
  // Krupni objekti — stroži prag (model ih često "vidi" pogrešno)
  chair: 0.5, couch: 0.5, bed: 0.5, "dining table": 0.5, tv: 0.45,
  refrigerator: 0.5, oven: 0.45, sink: 0.45, toilet: 0.45, book: 0.45,
  // Klase našeg modela. Ono što ubija — struja, gušenje, davljenje, pad niz
  // stepenice — prolazi sa niskim pragom: roditelj radije jednom proveri
  // višak nego da mu utičnica promakne. Fioka i kada su krupne i lako se
  // vide, pa smeju da traže više.
  socket: 0.3, plastic_bag: 0.3, blind: 0.3, stairs: 0.35, candle: 0.35,
  coin: 0.35, kettle: 0.4, stove: 0.4, fireplace: 0.4, heater: 0.4,
  bathtub: 0.45, drawer: 0.45,
};
// Ispod ove normalizovane površine box je šum senzora, ne objekat
const MIN_AREA = 0.0004;

// ANTI-GENERALIZACIJA PO POLOŽAJU: predmeti koji žive na podu/stolu ne mogu
// biti u gornjem delu kadra — tamo su plafonjere, lusteri i detektori dima.
// Sprečava gluposti tipa "frizbi na plafonu".
const CEILING_Y = 0.2;
const GROUND_CLASSES = new Set([
  "sports ball", "frisbee", "cup", "bowl", "bottle", "wine glass", "vase",
  "apple", "orange", "carrot", "hot dog", "donut", "cake", "pizza", "remote",
  "book", "clock", "teddy bear", "hair drier", "toothbrush", "banana",
  "spoon", "fork", "knife", "scissors", "mouse", "keyboard", "cell phone",
]);

function plausiblePosition(label: string, box: { y: number; h: number }): boolean {
  if (!GROUND_CLASSES.has(label)) return true;
  const centerY = box.y + box.h / 2;
  return centerY > CEILING_Y; // centar u zoni plafona → nemoguće, odbaci
}
// NMS: dve detekcije iste klase sa ovolikim preklapanjem su isti objekat
const NMS_IOU = 0.45;

function effectiveThreshold(cocoClass: string): number {
  const base = CLASS_MIN[cocoClass] ?? DEFAULT_MIN;
  return Math.max(0.15, Math.min(0.9, base + thresholdAdjustment(cocoClass)));
}

/** Presek-kroz-uniju dva normalizovana boxa (0 = bez dodira, 1 = identični). */
export function boxIou(a: HazardBox, b: HazardBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter === 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/** NMS: ukloni duplikate iste klase (isti objekat viđen na više pločica). */
function nms(dets: Detection[]): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (kept.some((k) => k.label === d.label && boxIou(k.box, d.box) > NMS_IOU)) continue;
    kept.push(d);
  }
  return kept;
}

let modelPromise: Promise<CocoModel> | null = null;

/** Poslednja greška učitavanja modela (null = nema greške). */
export let modelError: string | null = null;

function loadModel(): Promise<CocoModel> {
  return (async () => {
    modelError = null;
    // PRIMARNO: YOLOv8n (640×640) — znatno precizniji, manje generalizuje.
    try {
      const { YoloModel } = await import("./yolo");
      return await YoloModel.load();
    } catch (e) {
      console.warn("YOLO nije mogao da se učita, prelazim na COCO-SSD:", e);
    }
    // REZERVA: COCO-SSD lite (300×300) — stariji, ali proveren
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    const cocoSsd = await import("@tensorflow-models/coco-ssd");
    // Model sa NAŠEG domena (spakovan u build) — bez ijednog spoljnog zahteva
    const modelUrl = `${location.origin}${import.meta.env.BASE_URL}model/model.json`;
    const model = await cocoSsd.load({ base: "lite_mobilenet_v2", modelUrl });
    // Warmup: prva inferencija kompajlira WebGL šejdere (najsporiji korak) —
    // uradi je odmah na praznom platnu da prava detekcija krene bez čekanja
    const warm = document.createElement("canvas");
    warm.width = 300;
    warm.height = 300;
    await model.detect(warm, 1, 0.5).catch(() => {});
    return model;
  })();
}

function getModel(): Promise<CocoModel> {
  if (!modelPromise) {
    modelPromise = loadModel();
    modelPromise.catch((e) => {
      // Neuspeh NE sme trajno da zaglavi aplikaciju — resetuj za novi pokušaj
      modelError = e?.message ?? "Model nije mogao da se učita";
      modelPromise = null;
    });
  }
  return modelPromise;
}

/** Pokreće preuzimanje modela unapred (poziva se pri ulasku u live mod). */
export function preloadDetector() {
  getModel().catch(() => {});
  // Naš model kućnih opasnosti ide uz COCO, ne umesto njega.
  preloadHazardModel();
}

/** Ručni ponovni pokušaj učitavanja (dugme u UI). */
export function retryDetector() {
  modelPromise = null;
  modelError = null;
  preloadDetector();
}

interface Region {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** grid×grid pločice sa preklapanjem (da objekat na šavu ne bude presečen). */
function gridRegions(w: number, h: number, grid: number, overlap: number): Region[] {
  const regions: Region[] = [];
  const tw = w / grid;
  const th = h / grid;
  const ox = tw * overlap;
  const oy = th * overlap;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const sx = Math.max(0, gx * tw - ox);
      const sy = Math.max(0, gy * th - oy);
      regions.push({
        sx,
        sy,
        sw: Math.min(w - sx, tw + 2 * ox),
        sh: Math.min(h - sy, th + 2 * oy),
      });
    }
  }
  return regions;
}

/** Centralna pločica — tu je najčešće ono na šta je roditelj usmerio kameru. */
function centerRegion(w: number, h: number): Region {
  return { sx: w * 0.25, sy: h * 0.25, sw: w * 0.5, sh: h * 0.5 };
}

async function detectRegion(
  model: CocoModel,
  source: Source,
  srcW: number,
  srcH: number,
  r: Region,
): Promise<Detection[]> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(r.sw);
  canvas.height = Math.round(r.sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, canvas.width, canvas.height);
  const preds = await model.detect(canvas, MAX_BOXES, RAW_THRESHOLD);
  return preds.map((p) => ({
    label: p.class,
    score: p.score,
    box: {
      x: (r.sx + p.bbox[0]) / srcW,
      y: (r.sy + p.bbox[1]) / srcH,
      w: p.bbox[2] / srcW,
      h: p.bbox[3] / srcH,
    },
  }));
}

export interface DetectOptions {
  /**
   * "photo" — puna precizna analiza: ceo kadar + 2×2 pločice + centar
   * (6 prolaza modela; sitni predmeti se vide jer su pločice "zumirane").
   */
  detail?: "photo";
  /** Live mod: pored celog kadra, dubinski skeniraj i JEDAN kvadrant
   * (rotira se svaki otkucaj → cela slika precizno pokrivena za ~5s). */
  quadrant?: number;
}

/**
 * Detektuje objekte na izvoru (video / slika / canvas) i mapira ih u opasnosti
 * po uzrastu. srcW/srcH su stvarne dimenzije sadržaja (za normalizaciju).
 */
export async function detectLocal(
  source: Source,
  srcW: number,
  srcH: number,
  ageGroup: AgeGroup,
  opts: DetectOptions = {},
): Promise<Hazard[]> {
  const model = await getModel();

  // 1) Ceo kadar — direktno na izvoru (najbrže, hvata krupne objekte)
  const fullPreds = await model.detect(source, MAX_BOXES, RAW_THRESHOLD);
  const all: Detection[] = fullPreds.map((p) => ({
    label: p.class,
    score: p.score,
    box: {
      x: p.bbox[0] / srcW,
      y: p.bbox[1] / srcH,
      w: p.bbox[2] / srcW,
      h: p.bbox[3] / srcH,
    },
  }));

  // 2) Zumirane pločice — hvataju SITNE predmete
  const regions: Region[] = [];
  if (opts.detail === "photo") {
    // BRZINA: dijagonalne pločice + centar (4 prolaza umesto 6). Pokrivenost
    // ostaje jer se pločice preklapaju 15%, a sken je osetno brži na telefonu.
    const tiles = gridRegions(srcW, srcH, 2, 0.15);
    regions.push(tiles[0], tiles[3], centerRegion(srcW, srcH));
  } else if (opts.quadrant !== undefined) {
    regions.push(gridRegions(srcW, srcH, 2, 0.12)[opts.quadrant % 4]);
  }
  for (const r of regions) {
    try {
      all.push(...(await detectRegion(model, source, srcW, srcH, r)));
    } catch {
      /* jedna pločica pala (memorija/canvas) — ostale i ceo kadar važe */
    }
  }

  // 2b) NAŠ model: utičnica, stepenice, sveća, kesa, gajtan roletne, kamin,
  // šporet, grejalica, čajnik, novčić, kada, fioka. COCO nijednu od tih ne
  // poznaje, a to su predmeti zbog kojih roditelj i skenira sobu. Ako model
  // nedostaje ili padne, vraća prazno i sve ostalo radi nepromenjeno.
  try {
    all.push(...(await detectHazards(source, srcW, srcH)));
  } catch {
    /* dodatni model je dodatak — njegov pad ne sme da odnese ceo nalaz */
  }

  // 3) Filtar po klasi (osetljivost + samoučenje) → šum → NMS spajanje
  const detections = nms(
    all
      .filter((d) => d.score >= effectiveThreshold(d.label))
      .filter((d) => d.box.w * d.box.h >= MIN_AREA)
      .filter((d) => plausiblePosition(d.label, d.box)),
  );
  // Gde je dete. `person` nema svoj nalaz i nikad se ne prijavljuje kao
  // opasnost — ali govori odakle dete dohvata stvari, pa dohvat prestaje da
  // bude procena po visini u kadru i postaje merena razdaljina.
  // U departmanu za ljubimce merilo je sam ljubimac, ne čovek: pas i mačka
  // su COCO klase koje detektor pouzdano vidi, i one govore odakle se stvari
  // dohvataju u toj kući.
  const subjects = isPet()
    ? ["dog", "cat", "bird"]
    : ["person"];
  const people = detections
    .filter((d) => subjects.includes(d.label) && d.score >= 0.45)
    .map((d) => d.box);

  // Predmeti se prevode u opasnosti, pa se PROSUĐUJU po tome gde stoje.
  // Bez tog drugog koraka detektor nabraja posuđe umesto da nalazi opasnosti:
  // izmereno je da na fotografiji kuhinje vrati sedam činija i saksija, a
  // nijednu od opasnosti koje u toj istoj kuhinji zaista postoje.
  return judgeByContext(mapDetectionsToHazards(detections, ageGroup), ageGroup, people);
}
