/**
 * NAŠ MODEL — dvanaest kućnih opasnosti koje COCO ne poznaje.
 *
 * COCO ima 80 klasa i među njima nema utičnice, stepenica, sveće, kese,
 * gajtana roletne ni kade. To nije sitnica nego rupa u sredini posla: na
 * fotografiji obične kuhinje postojeći detektor je vratio sedam nalaza —
 * činije, saksije i flašu — dok šporet, utičnicu i sredstvo za čišćenje
 * ispod sudopere nije ni pomenuo.
 *
 * Zato je ovaj model istreniran namenski, doterivanjem YOLOv8n na primerima
 * iz Open Images V7 (`tools/hazard-dataset.py`, `tools/hazard-train.py`).
 * Radi UZ postojeći COCO model, ne umesto njega: jedan zna nož i šporet,
 * drugi zna utičnicu i stepenice, a nalazi se spajaju.
 *
 * Vrti se kroz onnxruntime-web, isti onaj koji već nosimo zbog procene
 * dubine, i služi se sa našeg domena — bez ijednog spoljnog zahteva.
 *
 * ŠTA OVAJ MODEL NIJE: nije zamena za oblak. Istreniran je na ulazu od
 * 320 px, na četiri procesorska jezgra, i na klasama kojih u Open Images-u
 * ima nejednako (utičnica je stala na 359 primera, jer ih više nema). Zna
 * malo stvari i zna ih osrednje — ali su to tačno one stvari koje su detetu
 * najopasnije, a koje do sada niko nije gledao dok oblak ne odgovori.
 */
import type { Detection } from "./hazardKnowledge";

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

interface Meta {
  imgsz: number;
  names: string[];
}

/** Ispod ovoga je nagađanje; iznad se prosleđuje na prosuđivanje konteksta. */
const SCORE_MIN = 0.3;

/**
 * IZMERENO na 1.006 proverenih slika koje model nije video u treningu.
 * mAP50 / odziv po klasi:
 *
 *     kada        0,87 / 0,84      kesa        0,56 / 0,54
 *     čajnik      0,80 / 0,79      UTIČNICA    0,55 / 0,47
 *     roletna     0,78 / 0,76      sveća       0,39 / 0,31
 *     novčić      0,69 / 0,55      fioka       0,30 / 0,23
 *     stepenice   0,69 / 0,68      GREJALICA   0,05 / 0,00
 *     kamin       0,68 / 0,73
 *     šporet      0,67 / 0,60      ukupno      0,58
 *
 * GREJALICA SE NE PRIKAZUJE. Odziv joj je nula — nije da greši, nego ne
 * pronalazi ništa. Open Images je imao samo 54 primera i to nije dovoljno.
 * Klasa koja nikad ne opali je mrtav teret; klasa koja opali nasumično je
 * gore od toga, jer roditelj ne zna da joj ne veruje. Ostaje u modelu (novi
 * trening košta tri sata) ali se njeni nalazi odbacuju ovde, na jednom mestu.
 *
 * Fioka i sveća imaju nizak odziv, ali ono što nađu uglavnom jeste tačno, pa
 * traže više poverenja umesto da se gase.
 */
const BLOCKED = new Set(["heater"]);
const CLASS_MIN: Record<string, number> = {
  bathtub: 0.35, kettle: 0.35, blind: 0.35, stairs: 0.35,
  fireplace: 0.4, stove: 0.4, coin: 0.4, plastic_bag: 0.4,
  // Utičnica je najvažnija klasa i najslabije potkrepljena (359 primera,
  // više ih u Open Images nema). Prag je nizak namerno: bolje da roditelj
  // jednom proveri višak nego da mu utičnica promakne.
  socket: 0.3,
  candle: 0.5, drawer: 0.55,
};
const NMS_IOU = 0.5;

let session: any = null;
let meta: Meta | null = null;
let loading: Promise<void> | null = null;
/** Ako model nedostaje ili ne može da se učita, ostatak aplikacije radi. */
let dead = false;

function base(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}

async function ensure(): Promise<boolean> {
  if (session && meta) return true;
  if (dead) return false;
  if (!loading) {
    loading = (async () => {
      const ort: any = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = `${base()}ort/`;
      ort.env.wasm.numThreads = 1;
      const m = await fetch(`${base()}model/hazard/hazard.json`);
      if (!m.ok) throw new Error("nema opisa modela");
      meta = (await m.json()) as Meta;
      session = await ort.InferenceSession.create(`${base()}model/hazard/hazard.onnx`, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    })().catch((e) => {
      // Tiho: model opasnosti je DODATAK. Ako ga nema, COCO detektor i oblak
      // rade dalje i roditelj ne vidi nikakvu grešku.
      console.warn("model opasnosti nije učitan:", e);
      dead = true;
      session = null;
      meta = null;
    });
  }
  await loading;
  return !!(session && meta);
}

/** Pokreni preuzimanje unapred (pri ulasku u skeniranje). */
export function preloadHazardModel() {
  void ensure();
}

function iou(a: number[], b: number[]): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const hit = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!hit) return 0;
  return hit / (a[2] * a[3] + b[2] * b[3] - hit);
}

/**
 * Nađi kućne opasnosti na izvoru. Vraća isti oblik kao COCO detektor, u
 * koordinatama izvora (0–1), pa se dalje spaja sa ostalim nalazima.
 */
export async function detectHazards(
  source: Source,
  srcW: number,
  srcH: number,
): Promise<Detection[]> {
  if (!(await ensure()) || !meta || !session) return [];
  const N = meta.imgsz;

  // Slika se uklapa uz očuvanje odnosa stranica, sa sivom ivicom — isto kao
  // pri treningu. Rastezanje bi model dočekalo oblicima kakve nikad nije
  // video, pa bi utičnica postala pravougaonik koji ne prepoznaje.
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const k = Math.min(N / srcW, N / srcH);
  const w = Math.round(srcW * k);
  const h = Math.round(srcH * k);
  const dx = Math.floor((N - w) / 2);
  const dy = Math.floor((N - h) / 2);
  ctx.fillStyle = "#727272";
  ctx.fillRect(0, 0, N, N);
  ctx.drawImage(source, dx, dy, w, h);

  const px = ctx.getImageData(0, 0, N, N).data;
  const input = new Float32Array(3 * N * N);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    input[p] = px[i] / 255;
    input[N * N + p] = px[i + 1] / 255;
    input[2 * N * N + p] = px[i + 2] / 255;
  }

  const ort: any = await import("onnxruntime-web/wasm");
  const feeds: Record<string, any> = {};
  feeds[session.inputNames[0]] = new ort.Tensor("float32", input, [1, 3, N, N]);
  const out = await session.run(feeds);
  const t = out[session.outputNames[0]];
  // YOLOv8 vraća [1, 4 + brojKlasa, brojPredloga]: prva četiri reda su
  // centar i veličina, ostali su ocene po klasi.
  const [, rows, cols] = t.dims as number[];
  const d = t.data as Float32Array;
  const nc = rows - 4;

  const raw: { box: number[]; score: number; cls: number }[] = [];
  for (let i = 0; i < cols; i++) {
    let best = 0;
    let bestC = 0;
    for (let c = 0; c < nc; c++) {
      const s = d[(4 + c) * cols + i];
      if (s > best) {
        best = s;
        bestC = c;
      }
    }
    const name = meta.names[bestC] ?? "";
    if (BLOCKED.has(name)) continue;
    if (best < (CLASS_MIN[name] ?? SCORE_MIN)) continue;
    const cx = d[i];
    const cy = d[cols + i];
    const bw = d[2 * cols + i];
    const bh = d[3 * cols + i];
    raw.push({ box: [cx - bw / 2, cy - bh / 2, bw, bh], score: best, cls: bestC });
  }

  raw.sort((a, b) => b.score - a.score);
  const kept: typeof raw = [];
  for (const r of raw) {
    if (kept.some((x) => x.cls === r.cls && iou(x.box, r.box) > NMS_IOU)) continue;
    kept.push(r);
    if (kept.length >= 40) break;
  }

  // Nazad iz uklopljenog kvadrata u koordinate izvora, pa u udeo 0–1.
  return kept.map((r) => ({
    label: meta!.names[r.cls] ?? String(r.cls),
    score: r.score,
    box: {
      x: Math.max(0, (r.box[0] - dx) / k / srcW),
      y: Math.max(0, (r.box[1] - dy) / k / srcH),
      w: Math.min(1, r.box[2] / k / srcW),
      h: Math.min(1, r.box[3] / k / srcH),
    },
  }));
}
