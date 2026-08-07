/**
 * Ravan zida iz same fotografije.
 *
 * Do sada je komad stajao kao nalepnica preko slike: uvek okrenut ka
 * posmatraču, ma kako zid bio ukošen. Na snimku iz demoa to se odmah vidi i
 * ruši ceo utisak — kupac ne veruje veličini koju mu pokazujemo ako slika ne
 * stoji na zidu.
 *
 * Rešenje ne traži ni model ni preuzimanje. Sobe su pune paralelnih
 * vodoravnih linija — sokla, ivica plafona, ram prozora, ivica police — a te
 * linije se u fotografiji sustiču u jednoj tački. Gde je ta tačka, toliko je
 * zid zakošen. Računa se iz gradijenta slike za nekoliko milisekundi, na
 * svakom telefonu, bez dozvola i bez ijednog preuzetog megabajta.
 *
 * Dobijeni ugao ide u CSS kao `rotateY`/`rotateX` uz `perspective`, pa
 * izobličenje crta grafička kartica — glatko i u realnom vremenu.
 */

/** Procena ravni: koliko je zid zakošen i koliko verujemo toj proceni. */
export interface Plane {
  /** Zaokret oko uspravne ose, u stepenima. Pozitivno = desna ivica dalje. */
  yaw: number;
  /** Nagib oko vodoravne ose, u stepenima. Pozitivno = donja ivica dalje. */
  pitch: number;
  /** Žižna daljina izražena kao deo širine slike — nezavisna od prikaza. */
  focalRatio: number;
  /** 0–1. Ispod praga se ne izobličava ništa: bolje ravno nego pogrešno. */
  confidence: number;
}

/** Telefoni snimaju sa vodoravnim vidnim uglom oko 68°. */
const FOCAL_RATIO = 1 / (2 * Math.tan((68 * Math.PI) / 180 / 2));

export const FLAT: Plane = { yaw: 0, pitch: 0, focalRatio: FOCAL_RATIO, confidence: 0 };

/** Radna širina analize. Veće od ovoga ne daje bolju procenu, samo sporije. */
const WORK = 240;

/** Ivica mora biti ovoliko jaka da uopšte glasa — inače šum vodi računicu. */
const EDGE = 42;

/** Ispod ovoliko slaganja procena je nagađanje. */
const MIN_CONFIDENCE = 0.22;

interface Grad {
  w: number;
  h: number;
  /** Jačina ivice po pikselu. */
  mag: Float32Array;
  /** Pravac duž same linije (ne poprečno na nju). */
  dx: Float32Array;
  dy: Float32Array;
}

function gradient(data: ImageData): Grad {
  const { width: w, height: h, data: px } = data;
  const grey = new Float32Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    grey[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  }
  const mag = new Float32Array(w * h);
  const dx = new Float32Array(w * h);
  const dy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        grey[i - w + 1] + 2 * grey[i + 1] + grey[i + w + 1] -
        grey[i - w - 1] - 2 * grey[i - 1] - grey[i + w - 1];
      const gy =
        grey[i + w - 1] + 2 * grey[i + w] + grey[i + w + 1] -
        grey[i - w - 1] - 2 * grey[i - w] - grey[i - w + 1];
      mag[i] = Math.hypot(gx, gy) / 4;
      // Sama linija stoji poprečno na gradijent.
      dx[i] = gy;
      dy[i] = -gx;
    }
  }
  return { w, h, mag, dx, dy };
}

const BINS = 81;
const RANGE = 2;

interface Vote {
  t: number;
  confidence: number;
}

/**
 * Gde se sustiče snop linija.
 *
 * Glasa se po `t = f / (presek − sredina)`, a ne po samom preseku: paralelne
 * linije se seku u beskonačnosti, što u pikselima nije broj koji se da
 * smestiti u niz, a ovako uredno padne na nulu. Čeoni zid — onaj koji nam
 * najčešće treba — daje snop paralelnih linija, pa mu je mesto tačno tu.
 */
function vote(g: Grad, focal: number, horizontal: boolean): Vote {
  const acc = new Float32Array(BINS);
  let total = 0;
  const cx = g.w / 2;
  const cy = g.h / 2;

  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      const i = y * g.w + x;
      const m = g.mag[i];
      if (m < EDGE) continue;

      const lx = g.dx[i];
      const ly = g.dy[i];
      // Vodoravni snop gleda samo linije koje su više vodoravne nego uspravne.
      if (horizontal ? Math.abs(lx) <= Math.abs(ly) : Math.abs(ly) <= Math.abs(lx)) continue;

      const along = horizontal ? lx : ly;
      const across = horizontal ? ly : lx;
      const here = horizontal ? x : y;
      const centre = horizontal ? cx : cy;
      const line = horizontal ? cy : cx;
      const at = horizontal ? y : x;

      let t: number;
      if (Math.abs(across) < 1e-3 * Math.abs(along)) {
        // Savršeno paralelna sa osom — sustiče se u beskonačnosti, dakle čeono.
        t = 0;
      } else {
        const hit = here + ((line - at) / across) * along;
        const d = hit - centre;
        t = Math.abs(d) < focal / RANGE ? Math.sign(d) * RANGE : focal / d;
      }
      const bin = Math.round(((t + RANGE) / (2 * RANGE)) * (BINS - 1));
      if (bin < 0 || bin >= BINS) continue;
      acc[bin] += m;
      total += m;
    }
  }
  if (total <= 0) return { t: 0, confidence: 0 };

  // Vrh se traži preko tri susedne kante: jedna sama je previše osetljiva.
  let best = 0;
  let mass = 0;
  for (let i = 1; i < BINS - 1; i++) {
    const s = acc[i - 1] + acc[i] + acc[i + 1];
    if (s > mass) {
      mass = s;
      best = i;
    }
  }
  return { t: (best / (BINS - 1)) * 2 * RANGE - RANGE, confidence: mass / total };
}

/** Iz glasanja u ugao: `t` je kotangens, a nama treba otklon od čeonog zida. */
function angle(t: number): number {
  if (!Number.isFinite(t) || t === 0) return 0;
  const deg = 90 - (Math.atan(1 / Math.abs(t)) * 180) / Math.PI;
  return Math.sign(t) * deg;
}

/**
 * Procena ravni zida iz fotografije sobe.
 *
 * Kad linija nema dovoljno ili se ne slažu, vraća se ravno stanje sa nultim
 * poverenjem i ništa se ne izobličava. Pogrešno nakrivljena slika je gora od
 * ravne — kupac ne zna da je procena promašila, samo vidi da nešto ne valja.
 */
export function estimatePlane(img: HTMLImageElement | HTMLCanvasElement): Plane {
  const srcW = "naturalWidth" in img ? img.naturalWidth : img.width;
  const srcH = "naturalHeight" in img ? img.naturalHeight : img.height;
  if (!srcW || !srcH) return FLAT;

  const w = Math.min(WORK, srcW);
  const h = Math.max(1, Math.round((srcH / srcW) * w));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return FLAT;
  ctx.drawImage(img, 0, 0, w, h);

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    // Slika sa tuđeg domena bez CORS-a zaprlja platno — tada ostajemo ravni.
    return FLAT;
  }

  const g = gradient(data);
  const focal = FOCAL_RATIO * w;
  const horiz = vote(g, focal, true);
  const vert = vote(g, focal, false);

  const ok = horiz.confidence > MIN_CONFIDENCE;
  const pitchRaw = vert.confidence > 0.3 ? angle(vert.t) : 0;

  return {
    // Ekstremni zaokret znači da zid gledamo skoro sa strane; tu komad ionako
    // ne bi bio čitljiv, pa se ugao pritegne na razuman opseg.
    yaw: ok ? Math.max(-52, Math.min(52, angle(horiz.t))) : 0,
    // Nagib je gotovo uvek mali; veliki ugao znači da je glasanje pogrešilo.
    pitch: Math.abs(pitchRaw) > 18 ? 0 : pitchRaw,
    focalRatio: FOCAL_RATIO,
    confidence: ok ? horiz.confidence : 0,
  };
}

/** Perspektiva se postavlja na okvir, u pikselima tog okvira. */
export const planePerspective = (p: Plane, boxWidth: number) =>
  `${Math.round(p.focalRatio * Math.max(1, boxWidth))}px`;

/** Transformacija samog komada, tako da legne u ravan zida. */
export const pieceTransform = (p: Plane) =>
  p.confidence <= 0
    ? "translate(-50%, -50%)"
    : `translate(-50%, -50%) rotateX(${p.pitch.toFixed(2)}deg) rotateY(${p.yaw.toFixed(2)}deg)`;
