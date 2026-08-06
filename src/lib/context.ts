/**
 * DA LI JE OVAJ PREDMET OPASAN *OVDE* — prosuđivanje umesto nabrajanja.
 *
 * Ovo je razlika između „detektora predmeta" i „detektora opasnosti", i ona
 * je izmerena, ne pretpostavljena. Na fotografiji obične kuhinje lokalni sloj
 * je vraćao sedam nalaza:
 *
 *     Činija · Saksija · Činija · Činija · Saksija · Flaša · Saksija
 *
 * Sve „srednje ozbiljno". U istoj toj kuhinji stvarne opasnosti su bile
 * upaljene ringle, vreo lonac, utičnica, sredstvo za čišćenje ispod sudopere
 * i staklene tegle — dakle nijedna od nabrojanih. Roditelj je dobijao ekran
 * pun činija, dok šporet niko ne pominje.
 *
 * Uzrok nije baza znanja: činija sa vrelom supom uz ivicu radne ploče JESTE
 * opasnost. Uzrok je što model vidi „bowl" i tvrdi opasnost, a ne zna da li
 * je u njoj supa ili stoji prazna na polici iznad glave. Prijavljivao se
 * DOMET MOGUĆNOSTI umesto onoga što se vidi.
 *
 * Zato ovde ne stoji nova baza podataka nego nekoliko pravila o PROSTORU,
 * koja ništa ne koštaju jer koriste ono što već imamo — položaj i veličinu
 * okvira, i odnos prema drugim predmetima u istom kadru:
 *
 *   - predmet pod plafonom nije nadohvat detetu koje puzi;
 *   - predmet NA šporetu je vreo, ma šta bio;
 *   - svakodnevni predmet (činija, saksija, flaša) je opasnost tek ako je
 *     detetu nadohvat — inače je samo posuđe.
 *
 * Pravila NE diraju predmete koji su opasni sami po sebi: nož je nož i na
 * najvišoj polici, jer odatle pada.
 */
import type { AgeGroup, Hazard } from "../types";
import { boxIou } from "./detector";

/**
 * Predmeti koji su opasni SAMO u kontekstu — svakodnevne stvari koje postoje
 * u svakoj kuhinji i dnevnoj sobi. Bez konteksta su šum koji zatrpa ekran.
 */
const ONLY_IN_CONTEXT = new Set([
  "bowl", "potted plant", "bottle", "cup", "wine glass", "vase", "book",
  "banana", "apple", "orange", "carrot", "sandwich", "cake", "donut",
  "spoon", "chair", "couch", "dining table", "bed", "tv", "sink",
]);

/**
 * Predmeti koji su opasni gde god da stoje. Nož na visokoj polici i dalje
 * može da padne, a lekovi ostaju lekovi.
 */
const ALWAYS = new Set([
  "knife", "scissors", "fork", "oven", "toaster", "microwave", "hair drier",
  "toilet", "refrigerator", "tv", "fire hydrant", "cell phone", "remote",
  "mouse", "keyboard", "teddy bear", "sports ball", "toothbrush",
  // Klase NAŠEG modela. Sve do jedne su birane baš zato što su opasnost, pa
  // nijedna ne prolazi kroz sito „je li nadohvat". Gajtan roletne visi pri
  // vrhu prozora i po visini bi ispao bezopasan — a omča je na visini vrata
  // deteta koje stoji. Sveća na stolu je isto tako iznad pojasa, i isto tako
  // opasna. Pravilo o dohvatu je za posuđe, ne za ovo.
  "socket", "stairs", "candle", "plastic_bag", "blind", "fireplace",
  "stove", "heater", "kettle", "coin", "bathtub", "drawer",
]);

/** Izvori toplote: šta god stoji na njima ili uz njih — vrelo je. */
const HEAT = new Set(["oven", "toaster", "microwave", "stove", "fireplace", "heater"]);

/**
 * Dokle seže dete. Broj je udeo visine kadra mereno odozdo: beba koja puzi
 * dohvata pod i nisku policu, trogodišnjak se penje na stolicu.
 *
 * Kadar nije soba, pa ovo nije precizna visina nego procena — ista ona koju
 * `priority.ts` već koristi za rangiranje. Ovde služi da odluči šta se uopšte
 * PRIJAVLJUJE, a ne samo kako se rangira.
 */
const REACH_BY_AGE: Record<AgeGroup, number> = {
  "0-6m": 0.25,
  "6-12m": 0.35,
  "1-2y": 0.45,
  "2-4y": 0.6,
  "4-7y": 0.7,
  "7y+": 0.8,
};

/** Da li predmet dodiruje ili stoji na izvoru toplote. */
function onHeatSource(h: Hazard, heat: Hazard[]): boolean {
  return heat.some((src) => {
    if (boxIou(h.box, src.box) > 0.05) return true;
    // Lonac STOJI na šporetu: donja ivica lonca je unutar zone šporeta,
    // a preklapanje okvira ume da bude malo jer je lonac sitniji.
    const bottom = h.box.y + h.box.h;
    const within = h.box.x + h.box.w / 2 > src.box.x
      && h.box.x + h.box.w / 2 < src.box.x + src.box.w;
    return within && bottom > src.box.y - 0.05 && bottom < src.box.y + src.box.h + 0.05;
  });
}

/**
 * Prosudi lokalne nalaze prema tome GDE su i pored ČEGA su.
 * Vraća samo ono što na ovoj slici zaista predstavlja opasnost.
 */
export function judgeByContext(hazards: Hazard[], age: AgeGroup): Hazard[] {
  const reach = REACH_BY_AGE[age] ?? 0.45;
  const heat = hazards.filter((h) => h.sourceClass && HEAT.has(h.sourceClass));
  const out: Hazard[] = [];

  for (const h of hazards) {
    const cls = h.sourceClass ?? "";
    // Dno predmeta u kadru: 1 je pod, 0 je plafon. Dete dohvata odozdo.
    const bottom = h.box.y + h.box.h;
    const reachable = bottom >= 1 - reach;

    if (onHeatSource(h, heat)) {
      // Šta god da stoji na šporetu, stoji na vrelom. Ovo je jedini slučaj u
      // kome se ozbiljnost DIŽE — i najčešća prava opasnost u kuhinji.
      out.push({
        ...h,
        category: "burn",
        severity: h.severity === "critical" ? "critical" : "high",
        contextNote: "na izvoru toplote",
      });
      continue;
    }

    if (ALWAYS.has(cls)) {
      out.push(h);
      continue;
    }

    if (ONLY_IN_CONTEXT.has(cls)) {
      // Svakodnevni predmet van dohvata nije opasnost nego nameštaj.
      // Ovde se nalaz TIHO izostavlja: prijaviti ga značilo bi zatrpati
      // ekran činijama dok šporet niko ne pominje.
      if (!reachable) continue;
      out.push({ ...h, contextNote: "nadohvat detetu" });
      continue;
    }

    // Nepoznata klasa: pušta se, ali samo ako je dete može dohvatiti.
    if (reachable) out.push(h);
  }

  return out;
}
