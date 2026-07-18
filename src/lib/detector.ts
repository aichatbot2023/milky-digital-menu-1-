/**
 * Lokalna (in-browser) detekcija objekata — TensorFlow.js COCO-SSD.
 * Model je SPAKOVAN U APLIKACIJU (public/model/) i služi se sa istog domena
 * kao i sajt — NEMA spoljnih preuzimanja u runtime-u, nema šta da padne.
 * WebGL ubrzanje na telefonu, bez API poziva — besplatno i neograničeno.
 */
import type { AgeGroup, Hazard } from "../types";
import { mapDetectionsToHazards } from "./hazardKnowledge";
import { thresholdAdjustment } from "./learning";

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
  "cell phone": 0.28, bottle: 0.28, "wine glass": 0.25, cup: 0.3,
  "sports ball": 0.25, tie: 0.25, "hair drier": 0.25, clock: 0.3,
  "teddy bear": 0.3, handbag: 0.3, backpack: 0.3, umbrella: 0.3,
  "hot dog": 0.3, apple: 0.32, orange: 0.32, carrot: 0.32,
  // Krupni objekti — stroži prag (model ih često "vidi" pogrešno)
  chair: 0.5, couch: 0.5, bed: 0.5, "dining table": 0.5, tv: 0.45,
  refrigerator: 0.5, oven: 0.45, sink: 0.45, toilet: 0.45, book: 0.45,
};
// Ispod ove normalizovane površine box je šum senzora, ne objekat
const MIN_AREA = 0.0008;

function effectiveThreshold(cocoClass: string): number {
  const base = CLASS_MIN[cocoClass] ?? DEFAULT_MIN;
  return Math.max(0.15, Math.min(0.9, base + thresholdAdjustment(cocoClass)));
}

let modelPromise: Promise<CocoModel> | null = null;

/** Poslednja greška učitavanja modela (null = nema greške). */
export let modelError: string | null = null;

function loadModel(): Promise<CocoModel> {
  return (async () => {
    modelError = null;
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
}

/** Ručni ponovni pokušaj učitavanja (dugme u UI). */
export function retryDetector() {
  modelPromise = null;
  modelError = null;
  preloadDetector();
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
): Promise<Hazard[]> {
  const model = await getModel();
  const preds = await model.detect(source, MAX_BOXES, RAW_THRESHOLD);
  const detections = preds
    .filter((p) => p.score >= effectiveThreshold(p.class))
    .map((p) => ({
      label: p.class,
      score: p.score,
      box: {
        x: p.bbox[0] / srcW,
        y: p.bbox[1] / srcH,
        w: p.bbox[2] / srcW,
        h: p.bbox[3] / srcH,
      },
    }))
    .filter((d) => d.box.w * d.box.h >= MIN_AREA);
  return mapDetectionsToHazards(detections, ageGroup);
}
