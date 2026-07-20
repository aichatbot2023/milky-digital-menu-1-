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
export async function downscaleImage(dataUrl: string, maxEdge = 1568): Promise<string> {
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
