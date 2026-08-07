/**
 * Proizvod izrezan iz svoje fotografije.
 *
 * Da bi kupac video predmet u svom prostoru, predmet mora da se odvoji od
 * svoje pozadine. Uobičajen put je model za uklanjanje pozadine — a to znači
 * megabajti preuzimanja na tuđem telefonu, ili tuđi server sa kvotom koja se
 * potroši. Oba puta imaju zid.
 *
 * Zida nema ako se iskoristi ono što o tim slikama već znamo: fotografija
 * proizvoda gotovo uvek stoji na mirnoj podlozi — beloj, peščanoj, sa mekom
 * senkom. Takva podloga se menja postepeno, a predmet počinje skokom. Zato
 * se ne gleda „koliko piksel liči na belo" nego „koliko liči na svog suseda":
 * izlivanje kreće od ivica slike i teče kroz preliv, a staje na ivici
 * predmeta. Bez modela, bez mreže, za nekoliko milisekundi, na svakom
 * uređaju.
 *
 * Kad podloga nije ravna — fotografija u ambijentu, senke, gradijent —
 * postupak to sam prepozna i odustane. Slika tada ostaje kakva jeste: bolje
 * cela fotografija nego predmet sa odsečenim komadom.
 */

export interface Cutout {
  /** Slika sa providnom pozadinom, ili original ako izrezivanje nije uspelo. */
  url: string;
  /** Da li je pozadina zaista uklonjena. */
  ok: boolean;
  /** Koliki deo slike je bio pozadina, 0–1. */
  removed: number;
  /** Okvir samog predmeta u slici, 0–1 — za postavljanje u pravoj razmeri. */
  box: { x: number; y: number; w: number; h: number };
}

const FULL = { x: 0, y: 0, w: 1, h: 1 };

/** Koliko sused sme da odskoči a da to i dalje bude ista podloga. */
const STEP = 26;

/** Koliko podloga sme ukupno da odluta od ivice — brana protiv curenja
 *  kroz meku senku u sam predmet. */
const DRIFT = 190;

/** Ispod ovoliko uklonjenog nije bilo podloge; iznad — pojeo bi i predmet. */
const MIN_REMOVED = 0.04;
const MAX_REMOVED = 0.97;

/**
 * Koliko svaka ivica slike mora biti pozadina.
 *
 * Ovo je razdelnik koji je izmeren, ne pogođen: kod fotografije proizvoda
 * najslabija ivica je i dalje 78–100 % pozadine, jer predmet stoji u sredini.
 * Kod fotografije sobe padne na 0–20 %, jer je uz ivicu nameštaj, prozor i
 * pod. Nijedan drugi pokazatelj ne razdvaja to dvoje ovako čisto.
 */
const MIN_EDGE = 0.6;

/** Preko ove širine se ne radi: veće ne menja rez, samo traje. */
const WORK = 512;

const dist = (a: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.abs(a[i] - r) + Math.abs(a[i + 1] - g) + Math.abs(a[i + 2] - b);

/**
 * Da li ivica slike izgleda kao podloga.
 *
 * Ne traži se ravna boja — preliv i meka senka su uobičajeni i sasvim u redu.
 * Traži se mirnoća: da se susedni pikseli po obodu ne razlikuju naglo.
 * Fotografija snimljena u sobi ima po obodu nameštaj, prozor i pod, pa joj
 * susedi skaču i odmah otpada.
 */
function background(px: Uint8ClampedArray, w: number, h: number) {
  // Obod se obilazi U KRUG. Prva verzija je nizala naizmenično gornji i donji
  // red, pa je svaki susedni par izgledao kao skok i nijedna slika nije prošla.
  const edge: number[] = [];
  for (let x = 0; x < w; x++) edge.push(x);
  for (let y = 1; y < h; y++) edge.push(y * w + w - 1);
  for (let x = w - 2; x >= 0; x--) edge.push((h - 1) * w + x);
  for (let y = h - 2; y > 0; y--) edge.push(y * w);

  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const p of edge) {
    rs.push(px[p * 4]); gs.push(px[p * 4 + 1]); bs.push(px[p * 4 + 2]);
  }
  const mid = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1];

  // Koliko puta obod naglo promeni ton — to su prava ivica predmeta ili soba.
  let jumps = 0;
  for (let i = 1; i < edge.length; i++) {
    const a = edge[i - 1] * 4;
    if (dist(px, edge[i] * 4, px[a], px[a + 1], px[a + 2]) > STEP * 2) jumps++;
  }
  return {
    r: mid(rs), g: mid(gs), b: mid(bs),
    calm: jumps / edge.length < 0.09,
  };
}

/**
 * Izrezivanje proizvoda sa ravne podloge.
 *
 * Slika mora biti već učitana. Ako dolazi sa tuđeg domena bez dozvole za
 * čitanje, platno se zaprlja i postupak uredno odustaje.
 */
export function cutout(img: HTMLImageElement | HTMLCanvasElement): Cutout {
  const srcW = "naturalWidth" in img ? img.naturalWidth : img.width;
  const srcH = "naturalHeight" in img ? img.naturalHeight : img.height;
  const fail = (url: string): Cutout => ({ url, ok: false, removed: 0, box: FULL });
  const original = "src" in img ? img.src : "";
  if (!srcW || !srcH) return fail(original);

  const scale = Math.min(1, WORK / srcW);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return fail(original);
  ctx.drawImage(img, 0, 0, w, h);

  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return fail(original);
  }
  const px = data.data;

  const bg = background(px, w, h);
  if (!bg.calm) return fail(original);

  // Izlivanje od ivica ka unutra. Red se drži u tipiziranom nizu jer obična
  // lista na velikoj slici pravi više smeća nego samog posla.
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;

  /** `from` je sused sa kog dolazimo; -1 znači da je piksel na samoj ivici. */
  const push = (p: number, from: number) => {
    if (p < 0 || p >= w * h || seen[p]) return;
    const i = p * 4;
    if (from >= 0) {
      const j = from * 4;
      // Skok u odnosu na suseda zaustavlja izlivanje na ivici predmeta...
      if (dist(px, i, px[j], px[j + 1], px[j + 2]) > STEP) return;
    }
    // ...a ukupno odstupanje od ivice sprečava da preliv odvede u sam predmet.
    if (dist(px, i, bg.r, bg.g, bg.b) > DRIFT) return;
    seen[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < w; x++) {
    push(x, -1);
    push((h - 1) * w + x, -1);
  }
  for (let y = 0; y < h; y++) {
    push(y * w, -1);
    push(y * w + w - 1, -1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    if (x > 0) push(p - 1, p);
    if (x < w - 1) push(p + 1, p);
    push(p - w, p);
    push(p + w, p);
  }

  const removed = tail / (w * h);
  if (removed < MIN_REMOVED || removed > MAX_REMOVED) return fail(original);

  // Pozadina mora da okružuje predmet sa svih strana.
  const share = (from: number, step: number, n: number) => {
    let hit = 0;
    for (let i = 0; i < n; i++) if (seen[from + i * step]) hit++;
    return hit / n;
  };
  const weakest = Math.min(
    share(0, 1, w),
    share((h - 1) * w, 1, w),
    share(0, w, h),
    share(w - 1, w, h),
  );
  if (weakest < MIN_EDGE) return fail(original);

  // Providna pozadina + okvir predmeta u istom prolazu.
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) {
      px[p * 4 + 3] = 0;
      continue;
    }
    const x = p % w;
    const y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 <= x0 || y1 <= y0) return fail(original);
  // Predmet koji se prostire preko celog kadra nije predmet nego prizor.
  if ((x1 - x0) / w > 0.97 && (y1 - y0) / h > 0.97) return fail(original);

  // Meka ivica: piksel uz samu granicu dobija pola prozirnosti, inače rez
  // izgleda kao makazama isečen papir.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (seen[p]) continue;
      if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) {
        px[p * 4 + 3] = 150;
      }
    }
  }

  ctx.putImageData(data, 0, 0);
  return {
    url: cv.toDataURL("image/png"),
    ok: true,
    removed,
    box: { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h },
  };
}

/** Izrezivanje slike sa adrese; nikad ne odbija, u najgorem vraća original. */
export function cutoutFrom(src: string): Promise<Cutout> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(cutout(img));
      } catch {
        resolve({ url: src, ok: false, removed: 0, box: FULL });
      }
    };
    img.onerror = () => resolve({ url: src, ok: false, removed: 0, box: FULL });
    img.src = src;
  });
}
