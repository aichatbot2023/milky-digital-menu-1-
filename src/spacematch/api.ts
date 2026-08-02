/**
 * Jedini most ka backendu (Supabase edge funkcija `spacematch`).
 * Klijent nikada ne drži tajne osim ključa zakupca koji sam vlasnik naloga
 * unese u svoju kontrolnu tablu — anon JWT je javan po dizajnu.
 */
const BASE = "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1";
const URL_FN = `${BASE}/spacematch`;
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

export async function call<T = any>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(URL_FN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/**
 * Graditelj demoa čita klijentov sajt i otvara zakupca — traje do minut,
 * pa ide u zasebnu funkciju sa dužim strpljenjem.
 */
export async function buildDemo(adminKey: string, website: string, vertical?: string) {
  const res = await fetch(`${BASE}/spacematch-demo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
    },
    body: JSON.stringify({ admin_key: adminKey, website, vertical }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as {
    slug: string; api_key: string; demo_url: string; products: number;
    source: string; brand: { name: string; logo: string | null; accent: string };
  };
}

/** Naplata ide kroz zasebnu funkciju — Stripe nikad ne dodiruje katalog. */
export async function billing<T = any>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/spacematch-billing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface Tenant {
  slug: string;
  name: string;
  vertical: string;
  plan: string;
  logo_url: string | null;
  color: string;
  accent: string;
  headline: string | null;
  subline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  currency: string;
  prompt_extra?: string | null;
  domain?: string | null;
}

export interface RoomProfile {
  roomType: string;
  style: string;
  lighting: string;
  dominantColors: string[];
  materials: string[];
  wallWidth: number;
  wallHeight: number;
  mood: string;
  recommendedSizes: { label: string; widthCm: number; heightCm: number }[];
  focalPoint: { x: number; y: number; w: number; h: number };
  notes: string;
  confidence: number;
}

export interface Match {
  id: string;
  sku: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  url: string | null;
  price: string | null;
  width_cm: string | null;
  height_cm: string | null;
  match: number;
  why: string;
}

export interface Alternative {
  id: string;
  title: string;
  image_url: string | null;
  price: string | null;
  width_cm: string | null;
  height_cm: string | null;
  match: number;
}

export const getTenant = (slug: string) =>
  call<{ tenant: Tenant }>({ action: "tenant", slug }).then((d) => d.tenant);

export const analyzeSpace = (slug: string, image: string, language: string, live = false) =>
  call<{ profile: RoomProfile }>({ action: "analyze", slug, image, language, live }).then((d) => d.profile);

export const recommend = (
  slug: string,
  profile: RoomProfile,
  preferences: Record<string, unknown>,
  lang: string,
) =>
  call<{ recommendations: Match[]; alternatives: Alternative[]; catalogSize: number }>({
    action: "recommend",
    slug,
    profile,
    preferences,
    lang,
  });

export const sendInquiry = (slug: string, fields: Record<string, unknown>) =>
  call({ action: "inquiry", slug, ...fields });

export const track = (slug: string, type: string, meta: Record<string, unknown> = {}) =>
  call({ action: "track", slug, type, meta }).catch(() => undefined);

/** Smanji fotografiju pre slanja — brže i uvek ispod limita edge funkcije. */
export function downscale(file: File, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
