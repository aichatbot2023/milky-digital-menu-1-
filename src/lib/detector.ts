/**
 * Lokalna (in-browser) detekcija objekata — TensorFlow.js COCO-SSD.
 * Model je SPAKOVAN U APLIKACIJU (public/model/) i služi se sa istog domena
 * kao i sajt — NEMA spoljnih preuzimanja u runtime-u, nema šta da padne.
 * WebGL ubrzanje na telefonu, bez API poziva — besplatno i neograničeno.
 */
import type { AgeGroup, Hazard } from "../types";
import { mapDetectionsToHazards } from "./hazardKnowledge";

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

interface CocoModel {
  detect(
    source: Source,
    maxNumBoxes?: number,
    minScore?: number,
  ): Promise<{ bbox: [number, number, number, number]; class: string; score: number }[]>;
}

const MAX_BOXES = 20;
const THRESHOLD = 0.4;

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
  const preds = await model.detect(source, MAX_BOXES, THRESHOLD);
  const detections = preds.map((p) => ({
    label: p.class,
    score: p.score,
    box: {
      x: p.bbox[0] / srcW,
      y: p.bbox[1] / srcH,
      w: p.bbox[2] / srcW,
      h: p.bbox[3] / srcH,
    },
  }));
  return mapDetectionsToHazards(detections, ageGroup);
}
