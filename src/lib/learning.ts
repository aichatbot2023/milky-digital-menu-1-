/**
 * Samoučenje (on-device): roditelj ocenjuje detekcije (👍 tačno / 👎 nije
 * opasnost), a aplikacija trajno prilagođava prag poverenja PO KLASI objekta.
 * - 👎 (lažna uzbuna) → prag za tu klasu raste → manje lažnih prijava
 * - 👍 (potvrđeno)    → prag blago pada → osetljivije na tu klasu
 * Sve ostaje na uređaju (localStorage) — besplatno, privatno, bez servera.
 */

const KEY = "safenest.learning";

interface ClassStats {
  confirms: number;
  rejects: number;
}

type Store = Record<string, ClassStats>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function save(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* privatni mod / puna memorija — učenje se preskače, app radi dalje */
  }
}

/** Zabeleži ocenu roditelja za COCO klasu (npr. "knife"). */
export function recordFeedback(cocoClass: string, correct: boolean) {
  const store = load();
  const s = store[cocoClass] ?? { confirms: 0, rejects: 0 };
  if (correct) s.confirms += 1;
  else s.rejects += 1;
  store[cocoClass] = s;
  save(store);
}

/**
 * Korekcija praga poverenja za klasu na osnovu istorije ocena.
 * Pozitivno = stroži prag (manje prijava), negativno = osetljivije.
 */
export function thresholdAdjustment(cocoClass: string): number {
  const s = load()[cocoClass];
  if (!s) return 0;
  const adj = s.rejects * 0.05 - s.confirms * 0.02;
  return Math.max(-0.1, Math.min(0.3, adj));
}

/** Kratak pregled naučenog — za prikaz u UI. */
export function learningSummary(): { classes: number; votes: number } {
  const store = load();
  const entries = Object.values(store);
  return {
    classes: entries.length,
    votes: entries.reduce((n, s) => n + s.confirms + s.rejects, 0),
  };
}
