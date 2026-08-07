/**
 * Skener hrane i pića: fotografija obroka/namirnice/etikete → AI procena
 * po uzrastu (sme / uz oprez / ne sme), sporni sastojci, alergeni, rizik
 * gušenja i savet za pripremu. "Mozak" je analyze-food edge funkcija
 * (Nemotron lanac besplatnih provajdera). Ako cloud nije dostupan,
 * prikazuju se lokalne smernice po uzrastu — ekran nikad nije prazan.
 */
import type { AgeGroup } from "../types";
import { languageEnglishName, localized } from "./i18n";

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
  const timer = setTimeout(() => abort.abort(), 35000);
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
        language: languageEnglishName(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Greška servera (${res.status})`);
    return data as FoodAnalysis;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ključne smernice ishrane po uzrastu (SZO/AAP) — offline rezerva.
 *
 * Srpski i engleski su ručno pisani; ostali jezici stižu iz `locales/<kod>.ts`
 * pod ključevima `$fd.*`, kao i sav ostali tekst u aplikaciji.
 */
type Bi = { sr: string; en: string };

const FOOD_ALWAYS: Bi[] = [
  {
    sr: "Nove alergene (kikiriki, jaja, mleko, riba, susam) uvodite jedan po jedan i pratite reakciju 2 dana.",
    en: "Introduce new allergens (peanut, egg, milk, fish, sesame) one at a time and watch for reactions for 2 days.",
  },
  {
    sr: "Dete uvek jede sedeći i pod nadzorom — nikad u hodu, autu ili ležeći.",
    en: "Children always eat seated and supervised — never walking, in the car or lying down.",
  },
];

const FOOD_BY_AGE: Record<string, Bi[]> = {
  "0-6m": [
    {
      sr: "Do 6 meseci: isključivo majčino mleko ili formula — bez vode, čajeva, soka i čvrste hrane.",
      en: "Up to 6 months: breast milk or formula only — no water, teas, juice or solid food.",
    },
    {
      sr: "MED je strogo zabranjen do 12 meseci (rizik botulizma).",
      en: "HONEY is strictly forbidden before 12 months (botulism risk).",
    },
  ],
  "6-12m": [
    { sr: "BEZ meda do 12 meseci (botulizam).", en: "NO honey before 12 months (botulism)." },
    {
      sr: "Bez dodate soli i šećera; kravlje mleko još nije glavni napitak.",
      en: "No added salt or sugar; cow's milk is not yet a main drink.",
    },
    {
      sr: "Gušenje: bez celog grožđa, orašastih plodova, kokica, viršli — sve seći na trakice.",
      en: "Choking: no whole grapes, nuts, popcorn or hot dogs — cut everything into strips.",
    },
  ],
  "1-2y": [
    {
      sr: "Gušenje je i dalje veliki rizik: grožđe i viršle seći PO DUŽINI na četvrtine; bez kokica, tvrdih bombona i celih oraha.",
      en: "Choking is still a major risk: cut grapes and hot dogs LENGTHWISE into quarters; no popcorn, hard sweets or whole nuts.",
    },
    {
      sr: "Punomasno mleko je u redu; med je dozvoljen posle 1. rođendana.",
      en: "Whole milk is fine; honey is allowed after the first birthday.",
    },
    {
      sr: "Bez kofeina, energetskih i gaziranih pića; minimalno soli i šećera.",
      en: "No caffeine, energy or fizzy drinks; minimal salt and sugar.",
    },
  ],
  "2-4y": [
    {
      sr: "I dalje seći grožđe, viršle i tvrdo voće; bez kokica, žvaka i tvrdih bombona do 4. godine.",
      en: "Keep cutting grapes, hot dogs and hard fruit; no popcorn, gum or hard sweets before age 4.",
    },
    {
      sr: "Bez kofeina i energetskih pića; ograničite slatkiše i grickalice.",
      en: "No caffeine or energy drinks; limit sweets and snacks.",
    },
  ],
  "4-7y": [
    {
      sr: "Oprez sa celim orašastim plodovima i tvrdim bombonama.",
      en: "Caution with whole nuts and hard sweets.",
    },
    {
      sr: "Bez energetskih pića i kofeina; voda umesto sokova.",
      en: "No energy drinks or caffeine; water instead of juice.",
    },
  ],
  other: [
    { sr: "Bez energetskih pića i kofeina za decu.", en: "No energy drinks or caffeine for children." },
    { sr: "Umeren šećer i so; raznovrsna ishrana.", en: "Moderate sugar and salt; a varied diet." },
  ],
};

export function offlineFoodGuidance(age: AgeGroup): string[] {
  const group = FOOD_BY_AGE[age] ? age : "other";
  return [
    ...FOOD_BY_AGE[group].map((b, i) => localized(`$fd.${group}.${i}`, b)),
    ...FOOD_ALWAYS.map((b, i) => localized(`$fd.always.${i}`, b)),
  ];
}
