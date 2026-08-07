/**
 * Dubina prostora sa jedne fotografije.
 *
 * Dokle god aplikacija gleda samo piksele, ona ne zna šta je ispred čega.
 * Zato lampa postavljena u sobu lebdi preko fotelje umesto da stane iza nje,
 * a predmet ostaje iste veličine bez obzira da li ga kupac spusti kraj sebe
 * ili na drugi kraj sobe. Oboje su iste rupe: nedostaje treća dimenzija.
 *
 * Ovde je popravljamo mapom dubine — za svaki piksel koliko je daleko.
 * Model je Depth Anything V2 Small (Apache-2.0), 19 MB, i stoji na NAŠEM
 * domenu zajedno sa svojim izvršnim okruženjem. Nijedan spoljni zahtev,
 * nijedan ključ, nijedna kvota.
 *
 * Tri stvari su namerne:
 *
 * 1. UČITAVA SE TEK KAD ZATREBA. Skeniranje mora da ostane trenutno, pa se
 *    ovih tridesetak megabajta ne dodiruju dok kupac ne otvori postavljanje
 *    u prostoru. Posle toga ostaju u kešu servisnog radnika.
 * 2. ULAZ PRATI ODNOS STRANICA. Kvadratni ulaz bi zgnječio sobu i iskrivio
 *    ravan poda. Obe strane se zaokružuju na umnožak od 14 (veličina zakrpe
 *    u modelu), a duža strana ide na `SIDE`.
 * 3. NEUSPEH NIJE GREŠKA. Star telefon, nema memorije, mreža pukla — sve to
 *    vraća `null`, a pozivalac nastavlja kao i pre. Dubina je dodatak, ne
 *    uslov.
 *
 * Mereno u pregledaču (jedna nit, bez grafičke kartice): 252×168 oko 1 s,
 * 196×140 oko 0,5 s. Zato se veličina bira prema tome koliko je prvi prolaz
 * trajao — spor uređaj sam pređe na manju.
 */

/** Duža strana ulaza. Umnožak od 14, kao veličina zakrpe u modelu. */
const SIDE = 252;
/** Na sporom uređaju se pada na ovo — mapa je grublja, ali stigne. */
const SIDE_SLOW = 196;
/** Preko ovoliko milisekundi uređaj se smatra sporim. */
const SLOW_MS = 2200;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface DepthMap {
  readonly w: number;
  readonly h: number;
  /**
   * Blizina, 0–1. VEĆE JE BLIŽE — to je ono što model zapravo daje
   * (obrnuta dubina), i zgodnije je za nas: odnos dve vrednosti je odnos
   * prividnih veličina na istoj slici.
   */
  readonly near: Float32Array;
  /** Blizina na tački slike, u koordinatama 0–1. */
  at(x: number, y: number): number;
  /** Sivi zapis za grafičku karticu — po jedan bajt na piksel. */
  grey(): Uint8Array;
}

let session: Promise<any> | null = null;
let slow = false;

/** Da li je mapa dubine već spremna — bez pokretanja preuzimanja. */
export const depthReady = () => session !== null;

async function open() {
  if (session) return session;
  session = (async () => {
    const ort: any = await import("onnxruntime-web/wasm");
    const base = `${location.origin}${import.meta.env.BASE_URL}`;
    // Izvršno okruženje se služi sa našeg domena; bez ovoga bi ga
    // biblioteka tražila na tuđem CDN-u.
    ort.env.wasm.wasmPaths = `${base}ort/`;
    // Više niti traži izolaciju porekla, a nju na GitHub Pages ne možemo da
    // postavimo — pa se i ne pretvaramo da je imamo.
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "error";
    const model = `${base}model/depth/depth-anything-v2-small.onnx`;
    const s = await ort.InferenceSession.create(model, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    return { ort, s };
  })();
  session.catch(() => {
    // Neuspeh ne sme trajno da zaključa mogućnost — sledeći poziv sme opet.
    session = null;
  });
  return session;
}

/** Zaokruži na umnožak od 14, jer model deli sliku na zakrpe te veličine. */
const patch = (n: number) => Math.max(14, Math.round(n / 14) * 14);

/**
 * Izmeri dubinu prostora sa slike.
 *
 * Vraća `null` kad god nešto ne uspe — pozivalac tada radi kao i pre.
 */
export async function estimateDepth(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<DepthMap | null> {
  const srcW = (source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || source.width;
  const srcH = (source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || source.height;
  if (!srcW || !srcH) return null;

  let ready;
  try {
    ready = await open();
  } catch {
    return null;
  }
  const { ort, s } = ready;

  const long = slow ? SIDE_SLOW : SIDE;
  const w = patch(srcW >= srcH ? long : (long * srcW) / srcH);
  const h = patch(srcW >= srcH ? (long * srcH) / srcW : long);

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);

  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Slika sa tuđeg domena bez dozvole za čitanje zaprlja platno.
    return null;
  }

  const n = w * h;
  const data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) data[k * n + i] = (px[i * 4 + k] / 255 - MEAN[k]) / STD[k];
  }

  let out: Float32Array;
  const started = performance.now();
  try {
    const res = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, h, w]) });
    out = res[s.outputNames[0]].data as Float32Array;
  } catch {
    return null;
  }
  if (performance.now() - started > SLOW_MS) slow = true;

  // Model vraća obrnutu dubinu u sopstvenoj skali. Deli se SAMO najvećom
  // vrednošću, bez oduzimanja najmanje.
  //
  // Ovo je bilo pogrešno u prvoj verziji i skupo se videlo: sa oduzimanjem
  // najmanje vrednosti odnos dve tačke više nije odnos njihovih pravih
  // udaljenosti, pa je lampa spuštena bliže narasla četiri puta preko svoje
  // mere. Bez oduzimanja odnos ostaje odnos, i mera drži.
  let hi = 0;
  for (let i = 0; i < out.length; i++) if (out[i] > hi) hi = out[i];
  const span = hi || 1;
  const near = new Float32Array(n);
  for (let i = 0; i < n; i++) near[i] = Math.max(0, out[i]) / span;

  return {
    w, h, near,
    at(x, y) {
      const cx = Math.min(w - 1, Math.max(0, Math.round(x * (w - 1))));
      const cy = Math.min(h - 1, Math.max(0, Math.round(y * (h - 1))));
      return near[cy * w + cx];
    },
    grey() {
      const g = new Uint8Array(n);
      for (let i = 0; i < n; i++) g[i] = Math.round(near[i] * 255);
      return g;
    },
  };
}

/**
 * Maska koja krije ono što je ISPRED predmeta.
 *
 * Za sliku bez grafičke kartice — a to je svaki običan `<img>` — zaklanjanje
 * se ne može uraditi u šejderu. Može ovako: crna tamo gde je soba bliža od
 * predmeta, bela svuda drugde, pa se to okači kao CSS maska. Rezultat je
 * isti: fotelja ostaje ispred, predmet iza nje.
 *
 * Maska se upisuje u PROVIDNOST, ne u svetlinu. CSS maska iz slike po
 * podrazumevanom pravilu čita alfa kanal; crno-belo u bojama ne bi uradilo
 * ništa i zaklanjanja prosto ne bi bilo — a to se ne vidi kao greška, nego
 * kao da posao nije ni urađen.
 */
export function maskBehind(map: DepthMap, placed: number, slack: number): string | null {
  const cv = document.createElement("canvas");
  cv.width = map.w;
  cv.height = map.h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(map.w, map.h);
  const limit = placed + slack;
  for (let i = 0; i < map.near.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = map.near[i] > limit ? 0 : 255;
  }
  ctx.putImageData(img, 0, 0);
  try {
    return cv.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Prosečna blizina unutar okvira, bez najbližih i najdaljih delova.
 *
 * Okvir predmeta uvek zahvati i komad pozadine oko njega. Sredina raspona
 * je otporna na to: uzima se srednja vrednost, pa i kad četvrtina okvira
 * gleda u daleki zid mera ostaje mera predmeta.
 */
export function depthIn(
  map: DepthMap,
  box: { x: number; y: number; w: number; h: number },
): number {
  const x0 = Math.max(0, Math.round(box.x * map.w));
  const y0 = Math.max(0, Math.round(box.y * map.h));
  const x1 = Math.min(map.w, Math.round((box.x + box.w) * map.w));
  const y1 = Math.min(map.h, Math.round((box.y + box.h) * map.h));
  const vals: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) vals.push(map.near[y * map.w + x]);
  }
  if (!vals.length) return map.at(box.x + box.w / 2, box.y + box.h / 2);
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}
