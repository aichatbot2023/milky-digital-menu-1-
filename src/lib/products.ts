/**
 * Brend marketplace: partnerski proizvodi koji rešavaju uočene opasnosti
 * (štitnici za uglove, poklopci za utičnice, sigurnosne kapije...).
 * Katalogom upravlja vlasnik u /admin.html; kupovina ide preko affiliate
 * linka partnera, a svaki klik se beleži za obračun provizije.
 */
import { isSr } from "./i18n";
import { getRef, track } from "./subscription";

export interface PartnerProduct {
  id: number;
  category: string;
  brand: string;
  title: string;
  title_en: string | null;
  url: string;
  price: string | null;
  /** Engleske ključne reči proizvoda — osnova za kontekstualno poklapanje. */
  keywords?: string | null;
  /** URL slike proizvoda (opciono) — kartica izgleda kao prava prodavnica. */
  image_url?: string | null;
}

const PRODUCTS_URL =
  "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/partners";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

const RECS_KEY = "safenest.recsOff"; // podrazumevano UKLJUČENO

export function recsEnabled(): boolean {
  try {
    return localStorage.getItem(RECS_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setRecsEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(RECS_KEY);
    else localStorage.setItem(RECS_KEY, "1");
  } catch {
    /* ignoriši */
  }
}

// Keš kataloga za sesiju (jedan mrežni poziv po otvaranju aplikacije)
let catalog: PartnerProduct[] | null = null;
let catalogPromise: Promise<PartnerProduct[]> | null = null;

export function fetchCatalog(): Promise<PartnerProduct[]> {
  if (catalog) return Promise.resolve(catalog);
  if (!catalogPromise) {
    catalogPromise = fetch(PRODUCTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON}`,
        "apikey": ANON,
      },
      body: JSON.stringify({ action: "products" }),
    })
      .then((r) => r.json())
      .then((d) => {
        catalog = Array.isArray(d.products) ? d.products : [];
        return catalog!;
      })
      .catch(() => {
        catalogPromise = null;
        return [];
      });
  }
  return catalogPromise;
}

/** Proizvodi za datu kategoriju opasnosti (max 3, da ne guše sadržaj). */
export async function productsForCategory(category: string): Promise<PartnerProduct[]> {
  if (!recsEnabled()) return [];
  const all = await fetchCatalog();
  return all.filter((p) => p.category === category).slice(0, 3);
}

/**
 * Amazon Associates (UK) tag Nicholas Family LTD — dodaje se automatski na
 * SVAKI amazon.* link iz kataloga koji ga već nema, pa linkovi u bazi ne
 * moraju da se prepravljaju.
 */
const AMAZON_TAG = "safenest0b-21";

function withAffiliateTag(url: string): string {
  if (!AMAZON_TAG) return url;
  try {
    const u = new URL(url);
    if (/(^|\.)amazon\./.test(u.hostname) && !u.searchParams.has("tag")) {
      u.searchParams.set("tag", AMAZON_TAG);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// ---------- KONTEKSTUALNA PREPORUKA ----------
// Preporuka mora da rešava BAŠ uočeni predmet: vrela kafa → šolja koja se
// ne prosipa, a NE „zaštita za šporet" samo zato što je ista kategorija.

/**
 * Rezervno rešenje kada cloud ne pošalje `solution` (npr. čisto lokalna
 * detekcija): mapa iz COCO klase detektora u proizvod koji je rešava.
 */
const SOLUTION_BY_CLASS: Record<string, string> = {
  cup: "spill proof insulated mug",
  "wine glass": "unbreakable stemless glasses",
  bottle: "cabinet safety lock",
  knife: "knife block with lock",
  scissors: "cabinet safety lock",
  fork: "drawer safety lock",
  spoon: "drawer safety lock",
  oven: "oven door child lock",
  microwave: "appliance door lock child",
  toaster: "cord shortener kitchen",
  sink: "tap thermometer child safe",
  refrigerator: "fridge door lock child",
  tv: "tv anti tip strap",
  laptop: "cable management box",
  remote: "battery compartment lock",
  "cell phone": "cable management box",
  keyboard: "cable tidy clips",
  mouse: "cable tidy clips",
  "potted plant": "plant pot child safety strap",
  chair: "chair moving prevention child",
  couch: "corner edge protectors",
  bed: "bed guard rail toddler",
  "dining table": "corner edge protectors",
  toilet: "toilet seat lock child",
  book: "bookcase anti tip strap",
  vase: "furniture anti tip straps",
  clock: "wall mount safety strap",
  scissorsx: "cabinet safety lock",
  "teddy bear": "toy storage box",
  "hair drier": "outlet cover with cord",
  toothbrush: "cabinet safety lock",
  handbag: "bag hook wall child safe",
  backpack: "bag hook wall child safe",
  suitcase: "furniture anti tip straps",
  dog: "pet gate indoor",
  cat: "pet gate indoor",
  bowl: "pet bowl mat raised",
};

/** Rezerva po kategoriji opasnosti kada ni klasa nije poznata. */
const SOLUTION_BY_CATEGORY: Record<string, string> = {
  burn: "child safety hob guard",
  electric: "plug socket covers",
  fall: "baby stair gate",
  choking: "cabinet safety locks",
  poisoning: "lockable medicine box",
  cutting: "corner edge protectors",
  crush: "furniture anti tip straps",
  strangulation: "blind cord safety winder",
  drowning: "non slip bath mat baby",
  other: "baby proofing kit",
};

/** Engleski upit za proizvod koji rešava OVU opasnost. */
export function solutionQuery(h: {
  solution?: string;
  sourceClass?: string;
  category: string;
}): string {
  if (h.solution && h.solution.trim()) return h.solution.trim();
  if (h.sourceClass && SOLUTION_BY_CLASS[h.sourceClass]) return SOLUTION_BY_CLASS[h.sourceClass];
  return SOLUTION_BY_CATEGORY[h.category] ?? SOLUTION_BY_CATEGORY.other;
}

/**
 * Reči koje se javljaju kod skoro svakog proizvoda za bebe — po njima se
 * ne sme poklapati, inače „blind cord safety winder" povuče i „baby stair
 * gate" samo zbog reči „safety".
 */
const STOPWORDS = new Set([
  "safety", "safe", "baby", "babies", "child", "children", "kids", "toddler",
  "proof", "proofing", "protector", "protectors", "guard", "guards", "for",
  "the", "and", "with", "set", "pack", "home", "house",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Amazon pretraga za tačno ovo rešenje (nosi naš affiliate tag). */
export function amazonSearchUrl(query: string): string {
  return `https://www.amazon.co.uk/s?k=${encodeURIComponent(query)}`;
}

/**
 * Ugrađena polica rešenja — da roditelj UVEK vidi konkretne proizvode, i
 * kada partnerski katalog još nije popunjen. Svaka stavka vodi na ciljanu
 * Amazon UK pretragu sa našim affiliate tagom: link nikad ne „umre" (za
 * razliku od fiksnog ASIN-a koji nestane kada proizvod izađe iz prodaje),
 * a provizija se svejedno obračunava na sve što kupac kupi u 24h.
 * Cene se namerno ne izmišljaju — Amazon ih prikazuje tačne.
 */
interface BuiltinSolution {
  /** Naslov na engleskom (i srpski prevod) — izgleda kao prava kartica. */
  en: string;
  sr: string;
  query: string;
}

const BUILTIN: Record<string, BuiltinSolution[]> = {
  burn: [
    { en: "Hob & cooker guard", sr: "Štitnik za šporet i ringle", query: "child safety hob guard cooker" },
    { en: "Oven door lock", sr: "Brava za vrata rerne", query: "oven door child lock" },
    { en: "Spill-proof insulated mug", sr: "Šolja koja se ne prosipa", query: "spill proof insulated travel mug" },
  ],
  electric: [
    { en: "Socket covers (24 pack)", sr: "Poklopci za utičnice (24 kom)", query: "plug socket covers uk 24 pack" },
    { en: "Cable tidy box", sr: "Kutija za sakrivanje kablova", query: "cable management box large" },
    { en: "Extension lead cover", sr: "Poklopac za produžni kabl", query: "power strip safety cover baby" },
  ],
  fall: [
    { en: "Stair gate, pressure fit", sr: "Kapija za stepenice", query: "baby stair gate pressure fit" },
    { en: "Window restrictor lock", sr: "Graničnik za prozor", query: "window restrictor lock child" },
    { en: "Anti-tip furniture straps", sr: "Trake protiv prevrtanja nameštaja", query: "furniture anti tip straps wall" },
  ],
  choking: [
    { en: "Small-parts choke tester", sr: "Merač sitnih delova", query: "small parts choke test cylinder" },
    { en: "Lockable toy storage box", sr: "Kutija za igračke sa bravom", query: "toy storage box with lid lockable" },
    { en: "Cupboard & drawer locks", sr: "Brave za ormariće i fioke", query: "cabinet safety locks adhesive" },
  ],
  poisoning: [
    { en: "Lockable medicine box", sr: "Kutija za lekove sa bravom", query: "lockable medicine box home" },
    { en: "Cupboard magnetic locks", sr: "Magnetne brave za ormariće", query: "magnetic cabinet locks child" },
    { en: "Cleaning caddy with lid", sr: "Kutija za hemiju sa poklopcem", query: "lockable cleaning products storage box" },
  ],
  cutting: [
    { en: "Corner & edge protectors", sr: "Štitnici za uglove i ivice", query: "corner edge protectors clear" },
    { en: "Knife block with lock", sr: "Držač za noževe sa bravom", query: "knife block with lock" },
    { en: "Drawer safety latches", sr: "Blokade za fioke", query: "drawer safety latches child" },
  ],
  crush: [
    { en: "Anti-tip furniture straps", sr: "Trake protiv prevrtanja", query: "furniture anti tip straps wall anchor" },
    { en: "Door finger guards", sr: "Štitnici za prste na vratima", query: "door finger pinch guard child" },
    { en: "TV anti-tip strap", sr: "Traka za TV protiv prevrtanja", query: "tv anti tip safety strap" },
  ],
  strangulation: [
    { en: "Blind cord winder & cleat", sr: "Namotač za kanap roletne", query: "blind cord safety winder cleat" },
    { en: "Cord shortener for appliances", sr: "Skraćivač kabla za uređaje", query: "appliance cord shortener kitchen" },
  ],
  drowning: [
    { en: "Non-slip bath mat", sr: "Neklizajuća prostirka za kadu", query: "non slip bath mat baby" },
    { en: "Toilet seat lock", sr: "Brava za WC dasku", query: "toilet seat lock child" },
    { en: "Tap thermometer & spout cover", sr: "Termometar i navlaka za slavinu", query: "bath tap cover thermometer baby" },
  ],
  other: [
    { en: "Complete baby-proofing kit", sr: "Kompletan set za obezbeđivanje doma", query: "baby proofing kit home safety" },
  ],
};

/** Bira ugrađena rešenja za opasnost i rangira ih po poklapanju sa upitom. */
function builtinFor(category: string, query: string): Recommendation[] {
  const pool = BUILTIN[category] ?? BUILTIN.other;
  const want = new Set(tokens(query));
  return pool
    .map((b) => ({
      b,
      overlap: tokens(b.query).filter((w) => want.has(w)).length,
    }))
    .sort((x, y) => y.overlap - x.overlap)
    .map(({ b }) => ({
      key: `b:${b.query}`,
      brand: "Amazon UK",
      title: isSr() ? b.sr : b.en,
      price: null,
      url: amazonSearchUrl(b.query),
      isSearch: false,
      image: null,
    }));
}

export interface Recommendation {
  key: string;
  brand: string;
  title: string;
  price: string | null;
  url: string;
  /** true = pretraga na Amazonu, false = konkretan proizvod iz kataloga */
  isSearch: boolean;
  productId?: number;
  image?: string | null;
}

/**
 * Preporuke za KONKRETNU opasnost: prvo proizvodi iz kataloga čije se
 * ključne reči poklapaju sa rešenjem (ne samo kategorija), pa uvek i
 * ciljana Amazon pretraga da roditelj nikad ne ostane bez rešenja.
 */
export async function recommendationsFor(h: {
  solution?: string;
  sourceClass?: string;
  category: string;
  label: string;
}): Promise<Recommendation[]> {
  if (!recsEnabled()) return [];
  const query = solutionQuery(h);
  const want = new Set(tokens(query));
  const all = await fetchCatalog();

  const scored = all
    .map((p) => {
      const hay = tokens(`${p.keywords ?? ""} ${p.title_en ?? ""} ${p.title}`);
      const overlap = hay.filter((w) => want.has(w)).length;
      // Kategorija je slab signal — sama po sebi ne kvalifikuje proizvod
      const score = overlap * 10 + (p.category === h.category ? 1 : 0);
      return { p, score, overlap };
    })
    // Bez ijedne zajedničke reči proizvod NIJE u kontekstu → ne prikazuj ga
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const out: Recommendation[] = scored.map(({ p }) => ({
    key: `p${p.id}`,
    brand: p.brand,
    title: isSr() ? p.title : (p.title_en ?? p.title),
    price: p.price,
    url: p.url,
    isSearch: false,
    productId: p.id,
    image: p.image_url ?? null,
  }));

  // Ako partnerski katalog nema ništa u kontekstu, roditelj ipak mora da
  // dobije konkretna rešenja — nikada praznu policu.
  for (const b of builtinFor(h.category, query)) {
    if (out.length >= 3) break;
    out.push(b);
  }

  out.push({
    key: `s:${query}`,
    brand: "Amazon UK",
    title: query,
    price: null,
    url: amazonSearchUrl(query),
    isSearch: true,
  });
  return out;
}

/** Otvori preporuku + zabeleži klik (kontekst: proizvod ili pretraga). */
export function openRecommendation(r: Recommendation) {
  track("click", getRef(), {
    product_id: r.productId ? String(r.productId) : "search",
    brand: r.brand,
    query: r.isSearch ? r.title : "",
  });
  window.open(withAffiliateTag(r.url), "_blank", "noopener");
}

/** Lokalizovan naziv proizvoda (sr default, en za ostale jezike). */
export function productTitle(p: PartnerProduct): string {
  return isSr() ? p.title : (p.title_en ?? p.title);
}

/** Otvori affiliate link partnera + zabeleži klik (obračun provizije). */
export function openProduct(p: PartnerProduct) {
  track("click", getRef(), { product_id: String(p.id), brand: p.brand });
  window.open(withAffiliateTag(p.url), "_blank", "noopener");
}
