/**
 * Lokalna (in-browser) detekcija objekata — ISTI sistem kao omni
 * (ai-team-meeting-studio): transformers.js + Xenova/yolos-tiny.
 * Model se učitava direktno sa javnog HuggingFace CDN-a (omni koristi
 * hf-proxy samo zato što njihova aplikacija ubacuje auth header u fetch —
 * naša nema taj problem). Radi offline nakon prvog učitavanja, bez API
 * poziva — besplatno i neograničeno.
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

let detectorPromise: Promise<(input: string, opts: object) => Promise<RawDetection[]>> | null = null;

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      // Lazy import — ~1MB JS + ~25MB model (jednom, potom keširano)
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      env.allowRemoteModels = true;
      const det = await pipeline("object-detection", MODEL);
      return det as unknown as (input: string, opts: object) => Promise<RawDetection[]>;
    })();
  }
  return detectorPromise;
}

/** Pokreće preuzimanje modela unapred (poziva se pri ulasku u live mod). */
export function preloadDetector() {
  getDetector().catch(() => {
    detectorPromise = null; // dozvoli ponovni pokušaj
  });
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
