/**
 * Praćenje predmeta kroz kadrove — pamćenje umesto ponovnog pogađanja.
 *
 * ZAŠTO POSTOJI
 * -------------
 * Uživo skeniranje je ranije radilo ovako: svaki prolaz modela bi napravio
 * potpuno nov spisak nalaza, upisao ga u mapu pod ključem koji je sadržao
 * ZAOKRUŽEN položaj predmeta (mreža 6×6 preko kadra), i ostavio stare unose
 * da žive 5,5 sekundi. Posledice su izmerene na NEPOKRETNOJ kameri, gde se
 * ništa nije micalo:
 *
 *   - reflektor je dvaput odskočio preko 69 % ekrana, ni zbog čega;
 *   - ista činija je brojana kao dve opasnosti, pod dva imena
 *     („Činija" i „Moguće: Činija"), pa je brojač skočio sa 2 na 3;
 *   - kartica koju roditelj čita menjala se pod prstom.
 *
 * Uzrok nije bio model nego knjigovodstvo. Zaokruživanje položaja znači da
 * predmet koji se pomeri za jedan piksel preko granice ćelije dobija NOV
 * ključ — i odjednom postoji dvaput. Kad se ruka zaista pomeri, isti predmet
 * ume da se namnoži u četiri.
 *
 * KAKO OVDE RADI
 * --------------
 * Nalaz se ne upisuje pod ključ nego se SPAJA sa predmetom koji već pratimo,
 * po preklapanju okvira. Predmet ima svoj trajan identitet: isti `id` dok
 * god je u kadru, bez obzira što ga model svaki put opiše malo drugačije.
 * Odatle sledi sve ostalo — okvir može da klizi umesto da skače, kartica
 * ima za šta da se zakači, a brojač broji predmete a ne prolaze modela.
 *
 * Zaboravljanje ide po PROMAŠAJIMA a ne po satu: predmet nestaje kad ga
 * model nekoliko puta zaredom ne vidi. Sat ne valja jer prolaz na telefonu
 * traje između pola sekunde i nekoliko sekundi, pa bi isti rok značio čas
 * dva promašaja čas dvadeset.
 */
import type { Hazard, HazardBox } from "../types";
import { boxIou } from "./detector";

export interface Track {
  id: string;
  /** Najbolje viđenje do sada (naziv, opis, rešenje). */
  h: Hazard;
  /** Ublažen okvir — ovo se crta na ekranu. */
  box: HazardBox;
  hits: number;
  misses: number;
  firstAt: number;
  lastAt: number;
}

/** Ispod ovog preklapanja to više nije isti predmet nego drugi pored njega. */
const MATCH_IOU = 0.35;
/** Toliko preklapanje je isti predmet čak i kad ga model drugačije nazove. */
const SAME_PLACE_IOU = 0.72;
/** Koliko okvir „klizi" ka novom položaju (1 = skoči odmah). */
const SMOOTH = 0.55;
/**
 * Slab nalaz mora da se ponovi da bi se prikazao; jak se prikazuje odmah.
 *
 * Ovo je namerno nesimetrično. Da SVAKI nalaz čeka potvrdu, nož bi se
 * pojavio tek iz drugog prolaza — a to je sekunda i po u kojoj roditelj
 * gleda u nož koji aplikacija ćuti. Da NIJEDAN ne čeka, vraća se treperenje.
 * Zato: ozbiljno i pouzdano ide odmah, nagađanje mora da se potvrdi.
 */
const SURE_ENOUGH = 0.5;
/** Potvrđen predmet preživi jedan loš prolaz; nagađanje ne preživi nijedan. */
const MAX_MISS = 2;
/**
 * Zaštita od zaglavljivanja: ako petlja stane (model pao, kartica u pozadini),
 * okviri ne smeju da ostanu zamrznuti na ekranu zauvek.
 */
const STUCK_MS = 12000;

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/**
 * Koliko se predmet SME pomeriti između dva prolaza a da ostane isti predmet,
 * mereno u sopstvenim veličinama.
 *
 * Preklapanje okvira samo po sebi ovde nije dovoljno. Prolaz modela na
 * telefonu traje sekundu i više, a za to vreme lopta ili šolja u ruci pređe
 * i više od svoje širine — okviri se tada uopšte ne dodiruju, pa bi isti
 * predmet svaki put bio „nov". Zato postoji i drugi put: isti tip predmeta
 * dovoljno blizu prethodnom mestu je on sam, koliko god da se odmakao.
 */
const NEAR_STEPS = 1.5;

/** Rastojanje centara, izraženo u veličinama samog predmeta. */
function stepsApart(a: HazardBox, b: HazardBox): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dy = a.y + a.h / 2 - (b.y + b.h / 2);
  const size = Math.max(0.02, (a.w + a.h + b.w + b.h) / 4);
  return Math.hypot(dx, dy) / size;
}

/** Da li dva viđenja opisuju isti predmet, a ne dva predmeta jedan uz drugi. */
function sameThing(a: Hazard, b: Hazard, iou: number): boolean {
  if (a.sourceClass && b.sourceClass && a.sourceClass === b.sourceClass) return true;
  if (a.category === b.category) return true;
  // Okviri se gotovo poklapaju: model se predomislio oko imena, ne oko
  // predmeta. Bolje jedan nalaz sa boljim imenom nego dva sa po jednim.
  return iou >= SAME_PLACE_IOU;
}

/** Koje od dva viđenja bolje opisuje predmet. */
function better(a: Hazard, b: Hazard): Hazard {
  // Sigurno ime uvek pobeđuje nesigurno — tako „Činija" pojede „Moguće:
  // Činija" umesto da stoje jedno pored drugog kao dve opasnosti.
  if (!!a.uncertain !== !!b.uncertain) return a.uncertain ? b : a;
  return (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a;
}

export class HazardTracker {
  private tracks: Track[] = [];
  private seq = 0;

  /** Uklanja sve — poziva se na kraju sesije. */
  reset() {
    this.tracks = [];
  }

  /**
   * Prima nalaze jednog prolaza i vraća ono što treba nacrtati.
   * `now` se prosleđuje spolja da bi merenje moglo da ga kontroliše.
   */
  update(dets: Hazard[], now: number): Hazard[] {
    // Sve moguće veze (postojeći predmet ↔ novo viđenje), od najboljeg
    // preklapanja nadole. Pohlepno spajanje: najuverljiviji par prvi bira.
    const pairs: { ti: number; di: number; score: number }[] = [];
    this.tracks.forEach((tr, ti) => {
      dets.forEach((d, di) => {
        const iou = boxIou(tr.box, d.box);
        if (iou >= MATCH_IOU && sameThing(tr.h, d, iou)) {
          pairs.push({ ti, di, score: 1 + iou });
          return;
        }
        // Okviri se ne dodiruju, ali je isti tip predmeta tu negde blizu:
        // predmet se pomerio, nije nastao nov. Blizina se ceni slabije od
        // preklapanja, pa preklapanje uvek bira prvo.
        const near = stepsApart(tr.box, d.box);
        if (near <= NEAR_STEPS && tr.h.sourceClass && tr.h.sourceClass === d.sourceClass) {
          pairs.push({ ti, di, score: 1 - near / NEAR_STEPS });
        }
      });
    });
    pairs.sort((a, b) => b.score - a.score);

    const usedT = new Set<number>();
    const usedD = new Set<number>();
    for (const p of pairs) {
      if (usedT.has(p.ti) || usedD.has(p.di)) continue;
      usedT.add(p.ti);
      usedD.add(p.di);
      const tr = this.tracks[p.ti];
      const d = dets[p.di];
      tr.h = better(tr.h, d);
      tr.box = {
        x: mix(tr.box.x, d.box.x, SMOOTH),
        y: mix(tr.box.y, d.box.y, SMOOTH),
        w: mix(tr.box.w, d.box.w, SMOOTH),
        h: mix(tr.box.h, d.box.h, SMOOTH),
      };
      tr.hits += 1;
      tr.misses = 0;
      tr.lastAt = now;
    }

    // Promašaj se broji SAMO predmetima koji su postojali pre ovog prolaza.
    // Bez ove granice, svaki tek napravljen predmet odmah dobija promašaj
    // (njegov redni broj nije među spojenima), pa slab nalaz biva odbačen
    // istog trena i nikad ne stigne da se potvrdi — potvrđivanje u dva
    // prolaza bilo je mrtvo slovo dok test nije pitao za njega.
    const before = this.tracks.length;
    for (let ti = 0; ti < before; ti++) {
      if (!usedT.has(ti)) this.tracks[ti].misses += 1;
    }

    // Nova viđenja koja se ni sa čim ne poklapaju su novi predmeti.
    dets.forEach((d, di) => {
      if (usedD.has(di)) return;
      this.tracks.push({
        id: `t${++this.seq}`,
        h: d,
        box: { ...d.box },
        hits: 1,
        misses: 0,
        firstAt: now,
        lastAt: now,
      });
    });

    this.tracks = this.tracks.filter(
      (tr) => tr.misses <= (this.shown(tr) ? MAX_MISS : 0) && now - tr.lastAt < STUCK_MS,
    );

    return this.tracks.filter((tr) => this.shown(tr)).map((tr) => ({
      ...tr.h,
      // Identitet nosi PREDMET, ne prolaz modela. Zbog ovoga kartica koju
      // roditelj čita ostaje ista dok je predmet u kadru.
      id: tr.id,
      box: tr.box,
      timesSeen: tr.hits,
    }));
  }

  /** Da li je predmet zaslužio da se prikaže. */
  private shown(tr: Track): boolean {
    if (tr.hits >= 2) return true;
    if (tr.h.severity === "critical") return true;
    return (tr.h.confidence ?? 1) >= SURE_ENOUGH && !tr.h.uncertain;
  }

  /** Koliko se predmeta trenutno prati (uključujući još nepotvrđene). */
  get size(): number {
    return this.tracks.length;
  }
}
