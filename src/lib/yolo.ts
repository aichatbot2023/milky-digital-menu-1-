/**
 * YOLOv8n u browseru (TensorFlow.js graph model) — glavni lokalni detektor.
 * Znatno precizniji od COCO-SSD lite (mAP ~37 vs ~22): bolje lokalizuje,
 * manje izmišlja i vidi sitnije predmete jer radi na ulazu 640×640
 * (SSD radi na 300×300). Iste 80 COCO klasa → postojeća baza znanja,
 * pragovi po klasi i samoučenje rade bez izmena.
 *
 * Model: Ultralytics YOLOv8n (AGPL-3.0), tfjs export, spakovan u
 * public/model/yolo/ — služi se sa našeg domena, bez spoljnih zahteva.
 */

type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export interface YoloPrediction {
  bbox: [number, number, number, number]; // px: x, y, w, h u prostoru izvora
  class: string;
  score: number;
}

const INPUT = 640;

// Standardni COCO-80 redosled (Ultralytics) — ista imena kao coco-ssd
const COCO_NAMES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
  "truck", "boat", "traffic light", "fire hydrant", "stop sign",
  "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
  "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag",
  "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
  "baseball bat", "baseball glove", "skateboard", "surfboard",
  "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon",
  "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot",
  "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant",
  "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote",
  "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear",
  "hair drier", "toothbrush",
];

// IoU prag za NMS unutar jednog YOLO prolaza
const NMS_IOU = 0.45;
const NMS_MAX = 50;

interface TfNs {
  loadGraphModel: (url: string) => Promise<any>;
  tidy: <T>(fn: () => T) => T;
  browser: { fromPixels: (s: Source) => any };
  image: {
    nonMaxSuppressionAsync: (
      boxes: any, scores: any, maxOut: number, iou: number, score: number,
    ) => Promise<any>;
  };
  tensor2d: (v: number[][], shape?: [number, number]) => any;
  tensor1d: (v: number[] | Float32Array) => any;
  dispose: (t: any) => void;
}

export class YoloModel {
  private constructor(private tf: TfNs, private model: any) {}

  static async load(): Promise<YoloModel> {
    const tf = (await import("@tensorflow/tfjs")) as unknown as TfNs & { ready: () => Promise<void> };
    await tf.ready();
    const url = `${location.origin}${import.meta.env.BASE_URL}model/yolo/model.json`;
    const model = await tf.loadGraphModel(url);
    const yolo = new YoloModel(tf, model);
    // Warmup — kompajlira WebGL šejdere da prva prava detekcija bude brza
    const warm = document.createElement("canvas");
    warm.width = INPUT;
    warm.height = INPUT;
    await yolo.detect(warm, 1, 0.5).catch(() => {});
    return yolo;
  }

  /** Isti potpis kao coco-ssd model.detect — direktna zamena u detektoru. */
  async detect(source: Source, maxNumBoxes = 30, minScore = 0.2): Promise<YoloPrediction[]> {
    const tf = this.tf;
    const srcW =
      (source as HTMLVideoElement).videoWidth || source.width || 1;
    const srcH =
      (source as HTMLVideoElement).videoHeight || source.height || 1;

    // Letterbox: uklopi izvor u 640×640 uz očuvanje razmere (sivi okvir)
    const scale = Math.min(INPUT / srcW, INPUT / srcH);
    const dw = Math.round(srcW * scale);
    const dh = Math.round(srcH * scale);
    const padX = Math.floor((INPUT - dw) / 2);
    const padY = Math.floor((INPUT - dh) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = INPUT;
    canvas.height = INPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    ctx.fillStyle = "#727272";
    ctx.fillRect(0, 0, INPUT, INPUT);
    ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, dw, dh);

    const outT = tf.tidy(() => {
      const img = tf.browser.fromPixels(canvas) as any;
      const input = img.toFloat().div(255).expandDims(0);
      return (this.model.execute(input) as any).squeeze([0]);
    });

    // Izlaz je [84, 8400] (kanali-prvo) ili [8400, 84] — prepoznaj po obliku
    const [d0, d1] = (outT as any).shape as [number, number];
    const channelMajor = d0 < d1; // 84 < 8400
    const n = channelMajor ? d1 : d0;
    const at = channelMajor
      ? (c: number, i: number) => raw[c * n + i]
      : (c: number, i: number) => raw[i * 84 + c];

    let raw: Float32Array;
    try {
      raw = (await outT.data()) as Float32Array;
    } finally {
      tf.dispose(outT);
    }

    // Dekodiranje: cx,cy,w,h + 80 klasa po redu; zadrži najbolju klasu
    const candBoxes: number[][] = [];
    const candScores: number[] = [];
    const candClass: number[] = [];
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestC = -1;
      for (let c = 0; c < 80; c++) {
        const s = at(4 + c, i);
        if (s > best) {
          best = s;
          bestC = c;
        }
      }
      if (best < minScore || bestC < 0) continue;
      const cx = at(0, i);
      const cy = at(1, i);
      const w = at(2, i);
      const h = at(3, i);
      // y1,x1,y2,x2 za tf NMS
      candBoxes.push([cy - h / 2, cx - w / 2, cy + h / 2, cx + w / 2]);
      candScores.push(best);
      candClass.push(bestC);
    }
    if (candBoxes.length === 0) return [];

    const boxesT = tf.tensor2d(candBoxes, [candBoxes.length, 4]);
    const scoresT = tf.tensor1d(candScores);
    let keep: number[];
    try {
      const idxT = await tf.image.nonMaxSuppressionAsync(
        boxesT, scoresT, Math.min(maxNumBoxes, NMS_MAX), NMS_IOU, minScore,
      );
      keep = Array.from((await idxT.data()) as Int32Array);
      tf.dispose(idxT);
    } finally {
      tf.dispose(boxesT);
      tf.dispose(scoresT);
    }

    // Nazad u prostor izvora (skini letterbox)
    return keep.map((i) => {
      const [y1, x1, y2, x2] = candBoxes[i];
      const px = Math.max(0, (x1 - padX) / scale);
      const py = Math.max(0, (y1 - padY) / scale);
      const pw = Math.min(srcW - px, (x2 - x1) / scale);
      const ph = Math.min(srcH - py, (y2 - y1) / scale);
      return {
        bbox: [px, py, pw, ph] as [number, number, number, number],
        class: COCO_NAMES[candClass[i]] ?? "unknown",
        score: candScores[i],
      };
    });
  }
}
