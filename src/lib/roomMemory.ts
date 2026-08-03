/**
 * Pamćenje prostora — koja je ovo soba, a ne kakva je.
 *
 * Obe aplikacije su do sada pamtile po VRSTI prostorije: „dnevna soba". To
 * je premalo. Ako roditelj ima dve dnevne sobe, ili skenira kod bake, sve mu
 * se meša u jedno. A kupcu u SpaceMatchu se pri svakom povratku traži da
 * ponovo snima isti prostor koji smo već videli.
 *
 * Prostor se prepoznaje po dve stvari koje se ne menjaju preko noći: šta u
 * njemu stoji i koje su mu boje. Kauč, sto i polica ostaju gde jesu; zid i
 * pod zadrže svoj ton. Odatle otisak, a poklapanje se meri koliko se ta dva
 * podudaraju sa nečim što smo već videli.
 *
 * Namerno je popustljivo prema sitnim promenama (pomeren stočić, nova stolica)
 * i strogo prema krupnim (druga soba, drugi stan). Kad nije sigurno, pravi se
 * nov prostor — bolje dva zapisa za istu sobu nego dve sobe pomešane u jedan.
 *
 * Sve ostaje na uređaju. Prostor u kome neko živi ne šaljemo nigde.
 */

const KEY = "safenest.rooms";
const MAX_ROOMS = 24;

/** Ispod ovoga to nije isti prostor. Mereno tako da pomeren nameštaj prođe. */
const SAME = 0.52;

/** Prostor koji se ne vidi ovoliko dugo se zaboravlja. */
const TTL_DAYS = 180;

export interface RoomPrint {
  /** Šta je u prostoru viđeno — imena predmeta, ponavljanja se broje. */
  objects: string[];
  /** Vodeće boje prostora, kao `#rrggbb`. */
  palette: string[];
}

export interface KnownRoom extends RoomPrint {
  id: string;
  /** Ime koje korisnik vidi; prazno dok ga sam ne nazove. */
  name: string;
  firstSeen: string;
  lastSeen: string;
  timesSeen: number;
  /** Slobodan prostor za aplikaciju — profil sobe, poslednji nalazi… */
  data?: Record<string, unknown>;
}

export interface RoomMatch {
  room: KnownRoom;
  /** 0–1, koliko se poklapa. */
  score: number;
  /** Koliko je dana prošlo od poslednjeg viđenja. */
  daysAgo: number;
}

function load(): KnownRoom[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - TTL_DAYS * 86400000;
    return raw.filter((r: KnownRoom) => r?.id && Date.parse(r.lastSeen) > cutoff);
  } catch {
    return [];
  }
}

function save(rooms: KnownRoom[]) {
  try {
    // Najskorije viđeni se čuvaju; stariji ispadaju kad se popuni.
    const keep = rooms
      .slice()
      .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
      .slice(0, MAX_ROOMS);
    localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    /* privatni režim ili puna memorija — pamćenje otpada, app radi dalje */
  }
}

/** Koliko se dva spiska predmeta poklapaju, računajući i ponavljanja. */
function objectScore(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const count = (xs: string[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const ma = count(a);
  const mb = count(b);
  let shared = 0;
  let total = 0;
  for (const k of new Set([...ma.keys(), ...mb.keys()])) {
    const x = ma.get(k) ?? 0;
    const y = mb.get(k) ?? 0;
    shared += Math.min(x, y);
    total += Math.max(x, y);
  }
  return total ? shared / total : 0;
}

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
};

/** Koliko se dve palete poklapaju — svaka boja traži sebi najbližu. */
function paletteScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0.5;
  let sum = 0;
  for (const one of a) {
    const [r, g, bl] = rgb(one);
    let best = 1;
    for (const two of b) {
      const [r2, g2, b2] = rgb(two);
      const d = (Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(bl - b2)) / 765;
      if (d < best) best = d;
    }
    sum += 1 - best;
  }
  return sum / a.length;
}

/**
 * Koliko dva otiska liče.
 *
 * Predmeti nose više od boje: dve bele sobe su i dalje dve sobe, ali soba sa
 * istim kaučem i istim stolom je verovatno ista soba i kad se zid prefarba.
 */
export function similarity(a: RoomPrint, b: RoomPrint): number {
  return 0.65 * objectScore(a.objects, b.objects) + 0.35 * paletteScore(a.palette, b.palette);
}

/** Da li smo ovaj prostor već videli. */
export function recognise(print: RoomPrint): RoomMatch | null {
  let best: RoomMatch | null = null;
  for (const room of load()) {
    const score = similarity(print, room);
    if (score >= SAME && (!best || score > best.score)) {
      best = {
        room,
        score,
        daysAgo: Math.max(0, Math.round((Date.now() - Date.parse(room.lastSeen)) / 86400000)),
      };
    }
  }
  return best;
}

/**
 * Zapamti prostor — osveži zatečeni ili napravi nov.
 *
 * Otisak se ne prepisuje nego blago pomera ka novom viđenju. Tako jedno loše
 * osvetljenje ili jedan zaklonjen predmet ne pokvare ono što znamo, a spora
 * promena prostora se ipak isprati.
 */
export function remember(print: RoomPrint, data?: Record<string, unknown>): KnownRoom {
  const rooms = load();
  const hit = recognise(print);
  const now = new Date().toISOString();

  if (hit) {
    const room = rooms.find((r) => r.id === hit.room.id)!;
    // Predmeti: ono što se vidi i sada ostaje, novo se dodaje.
    room.objects = Array.from(new Set([...room.objects, ...print.objects])).slice(0, 40);
    room.palette = print.palette.length ? print.palette.slice(0, 6) : room.palette;
    room.lastSeen = now;
    room.timesSeen++;
    if (data) room.data = { ...(room.data ?? {}), ...data };
    save(rooms);
    return room;
  }

  const room: KnownRoom = {
    id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    objects: print.objects.slice(0, 40),
    palette: print.palette.slice(0, 6),
    firstSeen: now,
    lastSeen: now,
    timesSeen: 1,
    data,
  };
  rooms.push(room);
  save(rooms);
  return room;
}

/** Korisnik daje prostoru ime — „dnevna soba", „kod bake". */
export function nameRoom(id: string, name: string) {
  const rooms = load();
  const room = rooms.find((r) => r.id === id);
  if (!room) return;
  room.name = name.slice(0, 40);
  save(rooms);
}

export const knownRooms = (): KnownRoom[] => load();

export function forgetRooms() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignoriši */
  }
}
