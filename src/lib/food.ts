/**
 * Skener hrane i pića: fotografija obroka/namirnice/etikete → AI procena
 * po uzrastu (sme / uz oprez / ne sme), sporni sastojci, alergeni, rizik
 * gušenja i savet za pripremu. "Mozak" je analyze-food edge funkcija
 * (Nemotron lanac besplatnih provajdera). Ako cloud nije dostupan,
 * prikazuju se lokalne smernice po uzrastu — ekran nikad nije prazan.
 */
import type { AgeGroup } from "../types";

export type FoodVerdict = "safe" | "caution" | "unsafe";

export interface FoodItem {
  name: string;
  status: FoodVerdict;
  why: string;
}

export interface FoodAnalysis {
  food_name: string;
  verdict: FoodVerdict;
  items: FoodItem[];
  allergens: string[];
  choking?: string | null;
  prep_tip?: string;
  summary: string;
}

export const VERDICT_META: Record<FoodVerdict, { label: string; color: string }> = {
  safe: { label: "Bezbedno uz nadzor", color: "#16a34a" },
  caution: { label: "Uz oprez", color: "#ca8a04" },
  unsafe: { label: "Ne davati", color: "#dc2626" },
};

const FOOD_URL =
  (import.meta.env.VITE_FOOD_FUNCTION_URL as string | undefined) ??
  "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/analyze-food";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

export async function analyzeFood(params: {
  imageDataUrl: string;
  ageGroup: AgeGroup;
  childName?: string;
}): Promise<FoodAnalysis> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 25000);
  try {
    const res = await fetch(FOOD_URL, {
      method: "POST",
      signal: abort.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON}`,
        "apikey": ANON,
      },
      body: JSON.stringify({
        image: params.imageDataUrl,
        ageGroup: params.ageGroup,
        childName: params.childName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška servera (${res.status})`);
    return data as FoodAnalysis;
  } finally {
    clearTimeout(timer);
  }
}

/** Ključne smernice ishrane po uzrastu (SZO/AAP) — offline rezerva. */
export function offlineFoodGuidance(age: AgeGroup): string[] {
  const always = [
    "Nove alergene (kikiriki, jaja, mleko, riba, susam) uvodite jedan po jedan i pratite reakciju 2 dana.",
    "Dete uvek jede sedeći i pod nadzorom — nikad u hodu, autu ili ležeći.",
  ];
  switch (age) {
    case "0-6m":
      return [
        "Do 6 meseci: isključivo majčino mleko ili formula — bez vode, čajeva, soka i čvrste hrane.",
        "MED je strogo zabranjen do 12 meseci (rizik botulizma).",
        ...always,
      ];
    case "6-12m":
      return [
        "BEZ meda do 12 meseci (botulizam).",
        "Bez dodate soli i šećera; kravlje mleko još nije glavni napitak.",
        "Gušenje: bez celog grožđa, orašastih plodova, kokica, viršli — sve seći na trakice.",
        ...always,
      ];
    case "1-2y":
      return [
        "Gušenje je i dalje veliki rizik: grožđe i viršle seći PO DUŽINI na četvrtine; bez kokica, tvrdih bombona i celih oraha.",
        "Punomasno mleko je u redu; med je dozvoljen posle 1. rođendana.",
        "Bez kofeina, energetskih i gaziranih pića; minimalno soli i šećera.",
        ...always,
      ];
    case "2-4y":
      return [
        "I dalje seći grožđe, viršle i tvrdo voće; bez kokica, žvaka i tvrdih bombona do 4. godine.",
        "Bez kofeina i energetskih pića; ograničite slatkiše i grickalice.",
        ...always,
      ];
    case "4-7y":
      return [
        "Oprez sa celim orašastim plodovima i tvrdim bombonama.",
        "Bez energetskih pića i kofeina; voda umesto sokova.",
        ...always,
      ];
    default:
      return [
        "Bez energetskih pića i kofeina za decu.",
        "Umeren šećer i so; raznovrsna ishrana.",
        ...always,
      ];
  }
}
