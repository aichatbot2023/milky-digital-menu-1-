/**
 * KO SE ŠTITI — dete ili ljubimac.
 *
 * Departman za ljubimce nije druga aplikacija nego DRUGA PAMET NAD ISTIM
 * OČIMA. Detektor, pratilac predmeta, prosuđivanje po prostoru, prikaz
 * rešenja na svom mestu, procena cele prostorije, učenje od korisnika —
 * sve to je isto, i tako mora i da ostane.
 *
 * Zašto ne kopija: kopiran kod se ne popravlja dvaput. Svaka izmerena
 * greška iz ovog razgovora — reflektor koji odskače, naziv koji beži van
 * kadra, preporuka koja nudi podlogu za kadu umesto kapije za stepenice —
 * morala bi da se popravlja na dva mesta, i drugo mesto bi se zaboravilo.
 * Ovako se departman za ljubimce popravlja svaki put kad se popravi onaj
 * za decu, i obrnuto.
 *
 * Razlikuje se samo ono što se ZAISTA razlikuje: šta je opasnost, za koga,
 * i kojim rečima se to kaže.
 */
import type { AgeGroup, Hazard } from "../types";
import { PET_RULES, type PetKind } from "./petKnowledge";
import { isSr } from "./i18n";

export type Domain = "child" | "pet";

/** Koga ova instanca aplikacije štiti. Postavlja se jednom, pri pokretanju. */
let domain: Domain = "child";

export function setDomain(d: Domain) {
  domain = d;
  try {
    document.documentElement.dataset.domain = d;
  } catch {
    /* ignoriši */
  }
}

export function getDomain(): Domain {
  return domain;
}

export const isPet = () => domain === "pet";

/**
 * Profil zaštićenog: kod dece uzrast, kod ljubimaca vrsta.
 *
 * Oba se prosleđuju kroz iste funkcije, pa tip mora da bude jedan. Vrsta
 * ljubimca igra tačno onu ulogu koju kod deteta igra uzrast: određuje šta je
 * opasno i koliko — ista biljka mačku ubija, a psu ne smeta.
 */
export type Profile = AgeGroup | PetKind;

const PET_KEY = "safenest.pet";

/** Izabrana vrsta ljubimca (departman za ljubimce). */
export function getPetKind(): PetKind {
  try {
    return (localStorage.getItem(PET_KEY) as PetKind) || "dog-small";
  } catch {
    return "dog-small";
  }
}

export function setPetKind(k: PetKind) {
  try {
    localStorage.setItem(PET_KEY, k);
  } catch {
    /* ignoriši */
  }
}

/**
 * Pravilo za klasu detektora u AKTIVNOM domenu, svedeno na ono što je
 * pozivaocu potrebno. Vraća `null` kad u ovom domenu ta klasa nije opasnost —
 * a to je često i namerno: saksija je za mačku smrtna opasnost, a za dete
 * sitnica; lopta je opasnost za velikog psa, a za dete igračka.
 */
export function petHazardFrom(
  cocoClass: string,
  kind: PetKind,
): Pick<Hazard, "label" | "category" | "severity" | "why" | "stats" | "fix" | "solution"> | null {
  const r = PET_RULES[cocoClass];
  if (!r) return null;
  const severity = r.severity[kind];
  if (!severity) return null;
  const sr = isSr();
  return {
    label: sr ? r.labelSr : r.labelEn,
    category: r.category,
    severity,
    why: sr ? r.whySr : r.whyEn,
    stats: sr ? r.statsSr : r.statsEn,
    fix: sr ? r.fixSr : r.fixEn,
    solution: r.solution,
  };
}

/**
 * Dokle ljubimac dohvata, kao udeo visine kadra mereno odozdo.
 *
 * Ovo je mesto na kom se dva departmana najviše razlikuju, i razlika nije
 * sitna. Kod deteta visina ozbiljno sužava opasnost — beba ne dohvata policu.
 * Mačka dohvata SVE: skače na frižider, hoda po radnoj ploči, spava na
 * ormaru. Zato za mačku i pticu pravilo o visini praktično ne važi, i to
 * nije propust nego tačan opis stvarnosti.
 */
export function petReach(kind: PetKind): number {
  switch (kind) {
    case "cat":
    case "bird":
      return 1; // ceo kadar — nema police na koju se ne penje
    case "dog-large":
      return 0.6;
    case "dog-small":
      return 0.4;
    default:
      return 0.3; // zec, glodar: pod i ono do njega
  }
}
