import type { AgeGroup, AnalysisResult, Hazard, RoomType } from "../types";
import { languageEnglishName } from "./i18n";

interface AnalyzeParams {
  imageDataUrl: string;
  roomType: RoomType;
  ageGroup: AgeGroup;
  childName?: string;
  /** Kadar iz živog videa: server tada traži samo 100% sigurne nalaze. */
  live?: boolean;
}

// Skida "data:image/jpeg;base64," prefiks i vraća [mediaType, base64]
function splitDataUrl(dataUrl: string): [string, string] {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) throw new Error("Neispravna slika");
  return [match[1], match[2]];
}

// Podrazumevani backend: OMNI Supabase projekat (edge funkcija analyze-hazards,
// besplatni OpenRouter vision modeli — nula troškova po pozivu).
const DEFAULT_OMNI_URL =
  "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/analyze-hazards";
// Javni anon ključ omni projekta (isti kao u omni frontend kodu) — omogućava
// poziv i ako je funkcija deploy-ovana sa uključenom JWT proverom.
const OMNI_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

const CLOUD_TIMEOUT_MS = 35000;

export async function analyzeImage(params: AnalyzeParams): Promise<AnalysisResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CLOUD_TIMEOUT_MS);
  try {
    return await doAnalyze(params, abort.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function doAnalyze(
  params: AnalyzeParams,
  signal: AbortSignal,
): Promise<AnalysisResult> {
  const omniUrl =
    (import.meta.env.VITE_OMNI_FUNCTION_URL as string | undefined) ?? DEFAULT_OMNI_URL;
  const vercelUrl = import.meta.env.VITE_API_URL as string | undefined;

  let res: Response;
  if (vercelUrl) {
    // Opcioni alternativni backend (Vercel + Anthropic Claude) — samo ako je
    // eksplicitno podešen VITE_API_URL.
    const [mediaType, base64] = splitDataUrl(params.imageDataUrl);
    res = await fetch(`${vercelUrl}/api/analyze`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: base64,
        mediaType,
        roomType: params.roomType,
        ageGroup: params.ageGroup,
        childName: params.childName,
      }),
    });
  } else {
    res = await fetch(omniUrl, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OMNI_ANON_KEY}`,
        "apikey": OMNI_ANON_KEY,
      },
      body: JSON.stringify({
        image: params.imageDataUrl,
        roomType: params.roomType,
        ageGroup: params.ageGroup,
        childName: params.childName,
        language: languageEnglishName(),
        live: params.live === true,
      }),
    });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Greška servera (${res.status})`);
  }

  const raw = await res.json();
  const hazards: Hazard[] = (raw.hazards ?? []).map((h: Omit<Hazard, "id">, i: number) => ({
    ...h,
    // Kartice u aplikaciji prikazuju kratke stavke — server ih šalje kao
    // nizove; ako model pogreši tip, ignoriši umesto da rušiš ekran
    facts: Array.isArray(h.facts) ? h.facts.filter((f) => typeof f === "string") : undefined,
    steps: Array.isArray(h.steps) ? h.steps.filter((s) => typeof s === "string") : undefined,
    reach: typeof h.reach === "number" ? h.reach : undefined,
    solution: typeof h.solution === "string" && h.solution.trim() ? h.solution.trim() : undefined,
    id: `hz-${i}`,
    resolved: false,
  }));

  return {
    hazards,
    safety_score: Math.max(0, Math.min(100, Math.round(raw.safety_score ?? 0))),
    summary: raw.summary ?? "",
  };
}

// Smanjuje sliku pre slanja (štedi tokene i ubrzava analizu)
/**
 * Slika za analizu — namerno mala.
 *
 * Bilo je 1568 px i to je bio pravi razlog zašto aplikacija „ne vidi
 * očiglednu opasnost". Besplatnim modelima na toliki kadar treba preko
 * trideset sekundi, telefon odustane posle trideset pet, i roditelj ostane
 * na onome što je lokalni detektor sam video — saksija i tri činije u kuhinji
 * sa vrelim šporetom.
 *
 * Izmereno na istoj kuhinji: 1568 px → niko ne stigne; 640 px → odgovor za
 * 16 s. 768 px je sredina koja staje u rok, a zadržava dovoljno sitnih
 * detalja (utičnica, ivica) da ih model uopšte vidi.
 */
export async function downscaleImage(dataUrl: string, maxEdge = 768): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale === 1) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Slika ne može da se učita"));
    img.src = dataUrl;
  });
}

/* ------------------------------------------------ provera lokalnih nalaza */

/** Koliko isečaka ide na proveru odjednom — više od ovoga niko i ne prikaže. */
const MAX_CHECK = 6;
/** Duža strana isečka koji se šalje. Dovoljno da se predmet prepozna. */
const CROP_SIDE = 320;

/** Isečak oko nalaza, sa malo okoline — predmet bez konteksta se teže prepozna. */
function cropOf(img: HTMLImageElement, box: Hazard["box"]): string | null {
  const pad = 0.25;
  const sx = Math.max(0, (box.x - box.w * pad) * img.naturalWidth);
  const sy = Math.max(0, (box.y - box.h * pad) * img.naturalHeight);
  const sw = Math.min(img.naturalWidth - sx, box.w * (1 + pad * 2) * img.naturalWidth);
  const sh = Math.min(img.naturalHeight - sy, box.h * (1 + pad * 2) * img.naturalHeight);
  if (sw < 8 || sh < 8) return null;
  const k = Math.min(1, CROP_SIDE / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round(sw * k));
  c.height = Math.max(8, Math.round(sh * k));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  try {
    return c.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

/**
 * Propusti dalje samo one lokalne nalaze koje je model koji VIDI potvrdio.
 *
 * Detektor u telefonu poznaje osamdeset predmeta i na svaku sliku mora nešto
 * da odgovori. Bez ove provere su mlinovi za biber stizali roditelju kao
 * „Flaša", sa gotovim tekstom o hemikalijama i alkoholom, i to kao PRVI
 * nalaz. Nalaz koji niko nije pogledao ovde se prosto ne vraća.
 *
 * Kad provera ne uspe — mreža, provajder, bilo šta — vraća se prazan spisak.
 * Manje nalaza je uvek bolje od izmišljenog nalaza.
 */
export async function verifyLocal(
  imageDataUrl: string,
  hazards: Hazard[],
): Promise<Hazard[]> {
  const wanted = hazards.filter((h) => h.sourceClass).slice(0, MAX_CHECK);
  if (!wanted.length) return [];

  const img = await new Promise<HTMLImageElement | null>((ok) => {
    const el = new Image();
    el.onload = () => ok(el);
    el.onerror = () => ok(null);
    el.src = imageDataUrl;
  });
  if (!img) return [];

  const crops: { claim: string; image: string }[] = [];
  const kept: Hazard[] = [];
  for (const h of wanted) {
    const image = cropOf(img, h.box);
    if (!image) continue;
    crops.push({ claim: h.sourceClass!, image });
    kept.push(h);
  }
  if (!crops.length) return [];

  try {
    const res = await fetch(
      (import.meta.env.VITE_OMNI_FUNCTION_URL as string | undefined) ?? DEFAULT_OMNI_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OMNI_ANON_KEY}`,
          apikey: OMNI_ANON_KEY,
        },
        body: JSON.stringify({ action: "verify", crops }),
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const verdicts: unknown[] = Array.isArray(data?.verdicts) ? data.verdicts : [];
    return kept
      .filter((_, i) => verdicts[i] === true)
      .map((h) => ({ ...h, verified: true }));
  } catch {
    return [];
  }
}
