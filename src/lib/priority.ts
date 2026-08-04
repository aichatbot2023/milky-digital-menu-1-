/**
 * AI Safety Coach — prioritizacija i grupisanje opasnosti.
 *
 * Filozofija: AI radi mnogo, prikazuje malo. Roditelj nikad ne vidi 23
 * nalaza odjednom — vidi JEDAN, najopasniji, sa jednom akcijom.
 *
 * Rangiranje NIJE po pouzdanosti modela (to zanima inženjera), nego po
 * stvarnom riziku za dete:
 *     Risk = Severity × Reachability × Probability × AgeFactor
 * Zato vrela kafa uvek ide ispred parčeta torte, iako model u tortu
 * možda ima veće poverenje.
 */
import type { AgeGroup, Hazard, HazardCategory } from "../types";
import { localized } from "./i18n";

/** Koliko je povreda teška po sebi (1–10). */
const SEVERITY_W: Record<Hazard["severity"], number> = {
  critical: 10,
  high: 8,
  medium: 5,
  low: 2,
};

/**
 * Verovatnoća da dete uopšte stupi u interakciju sa ovom vrstom opasnosti
 * (1–10) — struja i gušenje su svakodnevni, davljenje ređe ali fatalno.
 */
const PROBABILITY_W: Record<HazardCategory, number> = {
  choking: 9,
  burn: 8,
  electric: 8,
  poisoning: 7,
  fall: 8,
  cutting: 7,
  crush: 6,
  strangulation: 6,
  drowning: 5,
  other: 4,
};

/** Koliko je uzrast ranjiv na datu kategoriju (1–10). */
const AGE_W: Record<AgeGroup, Partial<Record<HazardCategory, number>>> = {
  "0-6m": { choking: 10, strangulation: 10, burn: 9, crush: 8, fall: 8 },
  "6-12m": { choking: 10, electric: 9, burn: 9, poisoning: 9, fall: 9 },
  "1-2y": { choking: 10, poisoning: 10, burn: 9, electric: 9, fall: 9, drowning: 9 },
  "2-4y": { fall: 10, burn: 9, poisoning: 9, choking: 8, cutting: 8, drowning: 9 },
  "4-7y": { fall: 9, cutting: 9, burn: 8, electric: 8, choking: 5 },
  "7y+": { electric: 8, cutting: 8, fall: 7, poisoning: 7, choking: 3 },
};
const AGE_DEFAULT = 6;

/**
 * Dohvatljivost: predmet nisko u kadru i krupniji = bliži detetu.
 * Cloud model može da pošalje i svoju procenu (`reach` 1–10) — ona ima
 * prednost jer „vidi" kontekst (ivica stola, polica na visini).
 */
function reachability(h: Hazard): number {
  if (typeof h.reach === "number" && h.reach >= 1 && h.reach <= 10) return h.reach;
  const centerY = h.box.y + h.box.h / 2;
  // Donja polovina kadra = zona deteta (10), sam vrh = plafon (2)
  const byHeight = centerY > 0.75 ? 10 : centerY > 0.5 ? 8 : centerY > 0.3 ? 6 : 3;
  // Veći predmeti u kadru su bliži kameri/detetu
  const area = h.box.w * h.box.h;
  const bySize = area > 0.15 ? 2 : area > 0.05 ? 1 : 0;
  return Math.min(10, byHeight + bySize);
}

/**
 * Upornost: opasnost koju roditelj vidi po treći put, a stoji nerešena
 * nedeljama, nije „ista" kao nova — dokazano je trajna. Memorija
 * (re-identifikacija) je diže u listi, najviše 1.6×.
 */
function persistence(h: Hazard): number {
  const seen = Math.max(1, h.timesSeen ?? 1);
  const days = h.firstSeenAt
    ? Math.max(0, (Date.now() - new Date(h.firstSeenAt).getTime()) / 86_400_000)
    : 0;
  return Math.min(1.6, 1 + (seen - 1) * 0.12 + Math.min(0.3, days * 0.02));
}

/** Ukupan rizik — jedini kriterijum redosleda. */
export function riskScore(h: Hazard, age: AgeGroup): number {
  const sev = SEVERITY_W[h.severity] ?? 4;
  const prob = PROBABILITY_W[h.category] ?? 4;
  const ageF = AGE_W[age]?.[h.category] ?? AGE_DEFAULT;
  return sev * reachability(h) * prob * ageF * persistence(h);
}

/**
 * Grupisanje: 5 istih oštrih ivica = JEDNA kartica sa oznakom „5 mesta",
 * a ne pet kartica. Spaja se po (kategorija + normalizovan naziv).
 */
function normLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RankedHazard extends Hazard {
  /** Koliko je istih pojava spojeno u ovu karticu (1 = jedinstvena). */
  count: number;
  /** Boxevi svih spojenih pojava — za overlay „5 mesta". */
  boxes: Hazard["box"][];
  risk: number;
}

/** Prioritetna lista: grupisano, sortirano po stvarnom riziku. */
export function rankHazards(hazards: Hazard[], age: AgeGroup): RankedHazard[] {
  const groups = new Map<string, RankedHazard>();
  for (const h of hazards) {
    const key = `${h.category}|${normLabel(h.label)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.boxes.push(h.box);
      // Grupa nasleđuje najtežu ozbiljnost i najveći rizik iz svojih pojava
      if (SEVERITY_W[h.severity] > SEVERITY_W[existing.severity]) {
        existing.severity = h.severity;
      }
      existing.risk = Math.max(existing.risk, riskScore(h, age));
      // Grupa nasleđuje najdužu istoriju svojih pojava
      existing.timesSeen = Math.max(existing.timesSeen ?? 1, h.timesSeen ?? 1);
      if (h.firstSeenAt && (!existing.firstSeenAt || h.firstSeenAt < existing.firstSeenAt)) {
        existing.firstSeenAt = h.firstSeenAt;
      }
      if (h.resolved === false) existing.resolved = false;
    } else {
      groups.set(key, {
        ...h,
        count: 1,
        boxes: [h.box],
        risk: riskScore(h, age),
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.risk - a.risk);
}

/**
 * „Zašto je opasno" — kratke činjenične stavke, ne pasus.
 * Cloud model ih vraća u `facts`; ako ih nema, izvlačimo rečenice iz `why`
 * i dodajemo izvedene činjenice (dohvat, broj mesta).
 */
export function factsFor(h: RankedHazard): string[] {
  const out: string[] = [];
  if (Array.isArray(h.facts) && h.facts.length > 0) {
    out.push(...h.facts.filter((f) => typeof f === "string" && f.trim()).slice(0, 4));
  }
  // Ranije se ovde, kad model ne vrati zasebne činjenice, rečenica po
  // rečenica prepisivao sam opis — pa je „ZAŠTO JE OVO OPASNO" doslovno
  // ponavljalo pasus iznad sebe. To nije bilo obaveštenje nego popuna.
  // Bolje je da odeljak nestane nego da kaže istu stvar dvaput.
  if (reachability(h) >= 8) {
    out.push(localized("$pr.reach", {
      sr: "Nadohvat je detetu",
      en: "Within the child's reach",
    }));
  }
  if (h.count > 1) {
    // Broj se ubacuje posle prevoda, da rečenica ostane gramatična.
    out.push(localized("$pr.count", {
      sr: "Uočeno na {n} mesta",
      en: "Found in {n} locations",
    }).replace("{n}", String(h.count)));
  }
  return [...new Set(out)].slice(0, 4);
}

/** „Uradi ovo odmah" — imperativni koraci, najviše 3. */
export function stepsFor(h: RankedHazard): string[] {
  if (Array.isArray(h.steps) && h.steps.length > 0) {
    return h.steps.filter((s) => typeof s === "string" && s.trim()).slice(0, 3);
  }
  if (!h.fix) return [];
  return h.fix
    .split(/(?<=[.!?])\s+|;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Bezbednosni skor koji RASTE dok roditelj rešava opasnosti (Duolingo
 * psihologija). Kreće od skora skena, a svaka rešena opasnost vraća deo
 * bodova srazmerno svom riziku.
 */
export function liveScore(base: number, ranked: RankedHazard[]): number {
  const open = ranked.filter((h) => !h.resolved);
  if (ranked.length === 0) return 100;
  const totalRisk = ranked.reduce((s, h) => s + h.risk, 0);
  const openRisk = open.reduce((s, h) => s + h.risk, 0);
  const recovered = totalRisk > 0 ? 1 - openRisk / totalRisk : 1;
  return Math.round(base + (100 - base) * recovered);
}
