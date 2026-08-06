/**
 * PROSTORIJA KAO CELINA — ono što se iz jedne slike ne vidi ni u principu.
 *
 * Jedan kadar je jedan zid. Roditelj koji slika kuhinju sa vrata ne vidi ono
 * iza sebe, a dete se kreće po celoj prostoriji. Zato prava opasnost često
 * nije predmet nego PUT do njega: stolica uz radnu ploču, ploča uz šporet.
 * Sva tri predmeta pojedinačno izgledaju bezopasno; zajedno su put do
 * ključale vode. Nijedan model to ne može da zaključi iz jedne fotografije,
 * ma koliko bio dobar — informacije prosto nema u kadru.
 *
 * Zato se ovde skupljaju nalazi sa VIŠE uglova iste prostorije i šalju na
 * jedan sud. Šalju se samo NALAZI, ne slike: sažimanje već potvrđenog traži
 * pamet a ne oči, pa je poziv tekstualni — red veličine jeftiniji i brži od
 * još jednog gledanja u fotografije, i zato izvodljiv na besplatnom planu.
 */
import type { Hazard, RoomType } from "../types";
import { DEFAULT_OMNI_URL, OMNI_ANON_KEY } from "./analyze";
import { languageEnglishName } from "./i18n";

export interface RoomRoute {
  chain: string;
  why: string;
  severity: Hazard["severity"];
}

export interface RoomAssessment {
  room_score: number;
  verdict: string;
  routes: RoomRoute[];
  repeated: string[];
  unchecked: string[];
  start_here: string;
  _angles?: number;
}

/** Uglovi iste prostorije skupljeni u ovoj sesiji. */
export interface Angle {
  scanId: string;
  roomType: RoomType;
  hazards: Hazard[];
}

const KEY = "safenest.angles";
/** Preko ovoga se ne skuplja: osmi ugao ne govori ništa novo o istoj sobi. */
const MAX_ANGLES = 6;

export function loadAngles(): Angle[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Angle[]) : [];
  } catch {
    return [];
  }
}

/**
 * Dodaj ugao. Uglovi se drže po VRSTI prostorije: kad roditelj krene da
 * skenira kupatilo, kuhinjski uglovi prestaju da budu deo iste priče.
 */
export function addAngle(a: Angle): Angle[] {
  const kept = loadAngles().filter((x) => x.roomType === a.roomType && x.scanId !== a.scanId);
  const next = [...kept, a].slice(-MAX_ANGLES);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* pun memorijski prostor — procena prostora se prosto preskače */
  }
  return next;
}

export function clearAngles() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignoriši */
  }
}

/** Koliko je uglova iste prostorije spremno za zajedničku procenu. */
export function anglesFor(roomType: RoomType): Angle[] {
  return loadAngles().filter((a) => a.roomType === roomType);
}

/**
 * Zatraži sud o celoj prostoriji. Vraća `null` kad procena nije moguća —
 * pozivalac tada prosto ne prikazuje karticu, bez poruke o grešci: procena
 * prostora je dodatak, a ne nešto zbog čega sken pada.
 */
export async function assessRoom(
  roomType: RoomType,
  ageGroup: string,
  angles: Angle[],
): Promise<RoomAssessment | null> {
  if (angles.length < 2) return null;
  try {
    const res = await fetch(DEFAULT_OMNI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OMNI_ANON_KEY}`,
        apikey: OMNI_ANON_KEY,
      },
      body: JSON.stringify({
        action: "room",
        roomType,
        ageGroup,
        language: languageEnglishName(),
        angles: angles.map((a) => ({
          hazards: a.hazards.map((h) => ({
            label: h.label,
            category: h.category,
            severity: h.severity,
            reach: h.reach,
          })),
        })),
      }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.error || !Array.isArray(d.routes)) return null;
    return d as RoomAssessment;
  } catch {
    return null;
  }
}
