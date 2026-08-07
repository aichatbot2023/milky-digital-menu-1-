/**
 * Memorija opasnosti: aplikacija PAMTI predmete koje roditelj nije rešio i
 * prepoznaje ih pri sledećem skeniranju iste prostorije.
 *
 * Galerija identiteta (REMIND obrazac) živi u localStorage, po prostoriji.
 * Svako novo viđenje adaptivno osvežava model izgleda, broji koliko je puta
 * viđeno i koliko dana stoji nerešeno — što onda diže prioritet i pokreće
 * podsetnike. Kada zapamćena nerešena opasnost NESTANE iz kadra, aplikacija
 * pita roditelja da li ju je rešio (umesto da tiho zaboravi).
 */
import type { Hazard, HazardCategory, RoomType, Severity } from "../types";
import {
  assignIdentities,
  blendDescriptor,
  emptyDescriptor,
  extractDescriptors,
  type Candidate,
  type Descriptor,
} from "./reid";

const KEY = "safenest.memory";
const MAX_ITEMS = 300;
/** Nerešeno se pamti mesec dana; posle toga je prostor sigurno drugačiji. */
const TTL_DAYS = 30;

export interface RememberedHazard {
  id: string;
  label: string;
  category: HazardCategory;
  severity: Severity;
  roomType: RoomType;
  desc: Descriptor;
  context: string[];
  firstSeen: string;
  lastSeen: string;
  timesSeen: number;
  resolvedAt: string | null;
  /** Poslednje poklapanje bilo sporno — čeka potvrdu korisnika. */
  provisional?: boolean;
}

function load(): RememberedHazard[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const cutoff = Date.now() - TTL_DAYS * 86_400_000;
    return arr.filter((x: RememberedHazard) => new Date(x.lastSeen).getTime() > cutoff);
  } catch {
    return [];
  }
}

function save(items: RememberedHazard[]) {
  try {
    // Najskorija viđenja imaju prednost ako se lista prepuni
    const trimmed = [...items]
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* pun localStorage — memorija nije kritična za rad aplikacije */
  }
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** Nerešene opasnosti zapamćene iz ranijih skenova (po prostoriji). */
export function unresolvedMemories(roomType?: RoomType): RememberedHazard[] {
  return load()
    .filter((m) => !m.resolvedAt && (!roomType || m.roomType === roomType))
    .sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());
}

export interface ReconcileResult {
  /** Opasnosti obogaćene istorijom (ista lista, isti redosled). */
  hazards: Hazard[];
  /** Zapamćene nerešene koje se NISU pojavile — kandidati za „rešeno je?". */
  missing: RememberedHazard[];
  /** Koliko ih je prepoznato iz ranijih skenova. */
  recognized: number;
}

/**
 * Uparuje nove nalaze sa memorijom, osvežava galeriju i vraća opasnosti
 * obogaćene podacima „viđeno N puta / nerešeno X dana".
 */
export async function reconcileWithMemory(
  imageDataUrl: string,
  hazards: Hazard[],
  roomType: RoomType,
): Promise<ReconcileResult> {
  const all = load();
  const gallery = all.filter((m) => m.roomType === roomType && !m.resolvedAt);

  let descs: Descriptor[];
  try {
    descs = await extractDescriptors(imageDataUrl, hazards);
  } catch {
    descs = hazards.map(() => emptyDescriptor());
  }

  const contextLabels = hazards.map((h) => h.label.toLowerCase());
  const fresh: Candidate[] = hazards.map((h, i) => ({
    label: h.label,
    category: h.category,
    desc: descs[i] ?? emptyDescriptor(),
    context: contextLabels.filter((_, j) => j !== i),
  }));
  const gal: Candidate[] = gallery.map((m) => ({
    label: m.label,
    category: m.category,
    desc: m.desc,
    context: m.context,
  }));

  const assignments = assignIdentities(fresh, gal);
  const now = new Date().toISOString();
  const matchedIds = new Set<string>();
  let recognized = 0;

  const enriched = hazards.map((h, i) => {
    const a = assignments[i];
    if (a.galleryIndex >= 0) {
      const mem = gallery[a.galleryIndex];
      matchedIds.add(mem.id);
      // Adaptivni model: pamćenje se pomera ka novom viđenju
      mem.desc = blendDescriptor(mem.desc, fresh[i].desc);
      mem.context = fresh[i].context;
      mem.lastSeen = now;
      mem.timesSeen += 1;
      mem.provisional = a.provisional;
      if (!a.provisional) recognized += 1;
      return {
        ...h,
        memoryId: mem.id,
        timesSeen: mem.timesSeen,
        firstSeenAt: mem.firstSeen,
        recognitionUncertain: a.provisional || undefined,
      };
    }
    // Nov identitet u galeriji
    const id = `mem-${Date.now()}-${i}`;
    all.push({
      id,
      label: h.label,
      category: h.category,
      severity: h.severity,
      roomType,
      desc: fresh[i].desc,
      context: fresh[i].context,
      firstSeen: now,
      lastSeen: now,
      timesSeen: 1,
      resolvedAt: null,
    });
    return { ...h, memoryId: id, timesSeen: 1, firstSeenAt: now };
  });

  const missing = gallery.filter((m) => !matchedIds.has(m.id) && m.timesSeen > 0);
  save(all);
  return { hazards: enriched, missing, recognized };
}

/** Roditelj je rešio opasnost — pamti se kao rešena (ne vraća se u fokus). */
export function rememberResolved(memoryId: string) {
  const all = load();
  const m = all.find((x) => x.id === memoryId);
  if (!m) return;
  m.resolvedAt = new Date().toISOString();
  save(all);
}

/** Vraća opasnost u nerešene (korisnik se predomislio). */
export function rememberUnresolved(memoryId: string) {
  const all = load();
  const m = all.find((x) => x.id === memoryId);
  if (!m) return;
  m.resolvedAt = null;
  save(all);
}

/** Zaboravi zapamćenu opasnost (korisnik kaže da je nikad nije ni bilo). */
export function forgetMemory(memoryId: string) {
  save(load().filter((m) => m.id !== memoryId));
}

/** Briše celu memoriju (npr. selidba ili reset iz podešavanja). */
export function clearMemory() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignoriši */
  }
}
