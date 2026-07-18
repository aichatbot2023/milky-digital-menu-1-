/**
 * Lokalna (in-browser) detekcija objekata — ISTI sistem kao omni
 * (ai-team-meeting-studio): transformers.js + Xenova/yolos-tiny.
 * Model fajlovi su SELF-HOSTOVANI na našem GitHub Pages sajtu (CI ih preuzme
 * pri build-u) — bez HuggingFace-a u runtime-u, bez 401/limita, besplatno.
 */
import type { AgeGroup, Hazard } from "../types";
import { mapDetectionsToHazards } from "./hazardKnowledge";

const MODEL = "Xenova/yolos-tiny-finetuned-coco";
const THRESHOLD = 0.35;

interface RawDetection {
  score: number;
  label: string;
  box: { xmin: number; ymin: number; xmax: number; ymax: number };
}

type Detector = (input: string, opts: object) => Promise<RawDetection[]>;

let detectorPromise: Promise<Detector> | null = null;

/** Napredak preuzimanja modela 0-100 (za prikaz u UI). */
export let modelProgress = 0;
/** Poslednja greška učitavanja modela (null = nema greške). */
export let modelError: string | null = null;

let progressListener: ((pct: number) => void) | null = null;
export function onModelProgress(cb: ((pct: number) => void) | null) {
  progressListener = cb;
}

function loadDetector(): Promise<Detector> {
  return (async () => {
    modelError = null;
    const { env, pipeline } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.allowRemoteModels = true;
    // Model se služi sa NAŠEG sajta (dist/models/, preuzeto u CI build koraku)
    env.remoteHost = `${location.origin}${import.meta.env.BASE_URL}models`;
    const files: Record<string, { loaded: number; total: number }> = {};
    const det = await pipeline("object-detection", MODEL, {
      dtype: "q8", // kvantizovan model — manji download, brže na telefonu
      progress_callback: (p: any) => {
        if (p.status === "progress" && p.file && p.total) {
          files[p.file] = { loaded: p.loaded, total: p.total };
          const loaded = Object.values(files).reduce((s, f) => s + f.loaded, 0);
          const total = Object.values(files).reduce((s, f) => s + f.total, 0);
          modelProgress = Math.min(99, Math.round((loaded / total) * 100));
          progressListener?.(modelProgress);
        }
        if (p.status === "ready") {
          modelProgress = 100;
          progressListener?.(100);
        }
      },
    });
    return det as unknown as Detector;
  })();
}

async function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = loadDetector();
    detectorPromise.catch((e) => {
      // Neuspeh NE sme trajno da zaglavi aplikaciju — resetuj za novi pokušaj
      modelError = e?.message ?? "Model nije mogao da se učita";
      detectorPromise = null;
    });
  }
  return detectorPromise;
}

/** Pokreće preuzimanje modela unapred (poziva se pri ulasku u live mod). */
export function preloadDetector() {
  getDetector().catch(() => {});
}

/** Ručni ponovni pokušaj učitavanja (dugme u UI). */
export function retryDetector() {
  detectorPromise = null;
  modelError = null;
  modelProgress = 0;
  preloadDetector();
}

/**
 * Detektuje objekte na slici (data URL) i mapira ih u opasnosti po uzrastu.
 * imageW/imageH su dimenzije prosleđene slike (za normalizaciju box-ova).
 */
export async function detectLocal(
  imageDataUrl: string,
  imageW: number,
  imageH: number,
  ageGroup: AgeGroup,
): Promise<Hazard[]> {
  const detector = await getDetector();
  const preds = await detector(imageDataUrl, { threshold: THRESHOLD });
  const detections = preds.map((p) => ({
    label: p.label,
    score: p.score,
    box: {
      x: p.box.xmin / imageW,
      y: p.box.ymin / imageH,
      w: (p.box.xmax - p.box.xmin) / imageW,
      h: (p.box.ymax - p.box.ymin) / imageH,
    },
  }));
  return mapDetectionsToHazards(detections, ageGroup);
}
