/**
 * spacematch — višekorisnička (multi-tenant) platforma za AI vizuelne
 * preporuke. „Shopify za AI preporuke": svaki biznis (galerija, nameštaj,
 * rasveta, enterijer, kuhinje, podovi, nekretnine) dobija svoj skener pod
 * sopstvenim brendom, sa sopstvenim katalogom i sopstvenom analitikom.
 *
 * Koristi POSTOJEĆU infrastrukturu SafeNest-a: isti Supabase projekat, isti
 * lanac BESPLATNIH vision provajdera (NVIDIA Nemotron → OpenRouter → Gemini
 * → Groq → Lovable). Nema OpenAI-a, nema novih troškova.
 *
 * IZOLACIJA: svaki red u svakoj tabeli nosi tenant_id. Javne akcije primaju
 * `slug` i nikada ne vraćaju podatke drugog zakupca; akcije zakupca traže
 * `api_key` koji se poredi sa ključem baš tog zakupca; akcije vlasnika
 * platforme traže ADMIN_KEY (Supabase secret, isti kao za SafeNest CRM).
 *
 * JAVNO:   tenant, products, analyze, recommend, inquiry, track, signup
 *           (signup = firma se prijavljuje da postane klijent platforme)
 * ZAKUPAC: t-stats, t-leads, t-product-add, t-product-del, t-import,
 *          t-update (brend, prompt, kontakt)
 * VLASNIK: list, create, delete, platform-stats, signups, signup-status
 */
import postgres from 'npm:postgres';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------- baza
let sql: ReturnType<typeof postgres> | null = null;
let ready = false;

function db() {
  if (!sql) {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL nije dostupan');
    sql = postgres(url, { max: 3, prepare: false });
  }
  return sql;
}

async function ensureTables() {
  if (ready) return;
  const s = db();
  await s`CREATE TABLE IF NOT EXISTS sm_tenants (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    vertical text NOT NULL DEFAULT 'art',
    plan text NOT NULL DEFAULT 'starter',
    api_key text NOT NULL,
    logo_url text,
    color text NOT NULL DEFAULT '#111827',
    accent text NOT NULL DEFAULT '#0f766e',
    headline text,
    subline text,
    prompt_extra text,
    contact_email text,
    contact_phone text,
    website text,
    domain text,
    currency text NOT NULL DEFAULT 'GBP',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE TABLE IF NOT EXISTS sm_products (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id bigint NOT NULL REFERENCES sm_tenants(id) ON DELETE CASCADE,
    sku text,
    title text NOT NULL,
    description text,
    image_url text,
    url text,
    price numeric,
    style text,
    colors text,
    materials text,
    room_types text,
    width_cm numeric,
    height_cm numeric,
    depth_cm numeric,
    tags text,
    popularity int NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE INDEX IF NOT EXISTS sm_products_tenant_idx ON sm_products (tenant_id, active)`;
  // Kolone koje uvodi naplata — ovde se osiguravaju da upiti nikad ne padnu
  // ako naplata još nije bila pozvana na ovom projektu.
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false`;
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS source_url text`;
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS stripe_customer text`;
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS stripe_subscription text`;
  await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS billing_status text`;
  await s`CREATE TABLE IF NOT EXISTS sm_scans (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id bigint NOT NULL REFERENCES sm_tenants(id) ON DELETE CASCADE,
    profile jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE INDEX IF NOT EXISTS sm_scans_tenant_idx ON sm_scans (tenant_id, created_at)`;
  await s`CREATE TABLE IF NOT EXISTS sm_leads (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id bigint NOT NULL REFERENCES sm_tenants(id) ON DELETE CASCADE,
    name text,
    email text,
    phone text,
    message text,
    product_ids text,
    profile jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE INDEX IF NOT EXISTS sm_leads_tenant_idx ON sm_leads (tenant_id, created_at)`;
  await s`CREATE TABLE IF NOT EXISTS sm_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id bigint NOT NULL REFERENCES sm_tenants(id) ON DELETE CASCADE,
    type text NOT NULL,
    meta jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE INDEX IF NOT EXISTS sm_events_tenant_idx ON sm_events (tenant_id, type, created_at)`;
  // Prijave firmi koje žele da postanu klijenti platforme (nisu vezane za
  // nijednog zakupca — to su budući zakupci, pa nema tenant_id)
  await s`CREATE TABLE IF NOT EXISTS sm_signups (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company text NOT NULL,
    person text,
    email text NOT NULL,
    phone text,
    website text,
    vertical text,
    catalogue_size text,
    plan text,
    message text,
    status text NOT NULL DEFAULT 'new',
    notified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`ALTER TABLE sm_signups ADD COLUMN IF NOT EXISTS notified boolean NOT NULL DEFAULT false`;
  // CRM: firme koje MI kontaktiramo (za razliku od sm_signups, gde se
  // firma javlja sama). Ovde živi ceo levak od hladnog kontakta do ugovora.
  await s`CREATE TABLE IF NOT EXISTS sm_prospects (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    company text NOT NULL,
    website text,
    country text,
    city text,
    vertical text,
    lang text NOT NULL DEFAULT 'en',
    contact_name text,
    email text,
    phone text,
    source text,
    status text NOT NULL DEFAULT 'new',
    demo_slug text,
    demo_url text,
    studio_key text,
    products_found int,
    demo_error text,
    outreach_subject text,
    outreach_body text,
    outreach_short text,
    notes text,
    next_action_at date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE INDEX IF NOT EXISTS sm_prospects_status_idx ON sm_prospects (status, updated_at)`;
  await s`CREATE UNIQUE INDEX IF NOT EXISTS sm_prospects_site_idx ON sm_prospects (lower(coalesce(website, company)))`;
  ready = true;
}

// ---------------------------------------------------------- AI provajderi
interface Provider {
  name: string;
  key: string | undefined;
  url: string;
  models: string[];
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

// Isti besplatni lanac kao SafeNest — provajder bez ključa se preskače,
// na grešci/429 ide se na sledeći. Vlasnik ne plaća ništa.
const PROVIDERS: Provider[] = [
  {
    name: 'nvidia',
    key: Deno.env.get('NVIDIA_NIM_API_KEY'),
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'],
    // Bez ovoga reasoning model „razmišlja" 40-60s po slici.
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
  {
    name: 'gemini',
    key: Deno.env.get('GEMINI_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.5-flash'],
  },
  {
    name: 'openrouter',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: (Deno.env.get('FREE_MODELS') ??
      'nvidia/nemotron-nano-12b-v2-vl:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free'
    ).split(',').map((m) => m.trim()).filter(Boolean),
    extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SpaceMatch AI' },
  },
  {
    name: 'groq',
    key: Deno.env.get('GROQ_API_KEY'),
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['meta-llama/llama-4-scout-17b-16e-instruct'],
  },
  {
    name: 'lovable',
    key: Deno.env.get('LOVABLE_API_KEY'),
    url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    models: ['google/gemini-2.5-flash'],
  },
];

const VERTICAL_EN: Record<string, string> = {
  art: 'art gallery (paintings, prints, photography, wall art)',
  furniture: 'furniture retail (sofas, tables, storage, beds)',
  lighting: 'lighting studio (pendants, floor lamps, wall lights)',
  interior: 'interior design studio (full room concepts)',
  kitchen: 'kitchen studio (cabinets, worktops, splashbacks)',
  flooring: 'flooring and rugs (wood, tile, carpet, rugs)',
  realestate: 'real estate staging (furnishing an empty property)',
};

/**
 * Prompt je NAMERNO na engleskom: slabiji besplatni modeli odgovaraju na
 * jeziku prompta i ignorišu direktivu. Engleski prompt + „OUTPUT LANGUAGE"
 * daje pouzdan izlaz na bilo kom jeziku.
 */
function buildPrompt(vertical: string, extra: string, language: string, live = false): string {
  const trade = VERTICAL_EN[vertical] ?? VERTICAL_EN.art;
  // Živi kadar: kupac drži telefon, kadar je često pod uglom i pomeren.
  // Traži se isti oblik odgovora, ali kraće i bez nagađanja detalja.
  const liveNote = live
    ? `

LIVE CAMERA FRAME — the customer is holding a phone and panning across the room:
- The frame may be tilted, partly cropped or slightly blurred. Judge only what is clearly visible.
- Keep "notes" to a single short clause and "mood" to two words.
- If the frame shows no usable wall or surface, lower "confidence" below 0.4 rather than inventing measurements.`
    : '';
  return `OUTPUT LANGUAGE: ${language}. Every human-readable value (style, mood, notes) MUST be written entirely in ${language}. Never mix languages.

You are a senior interior designer advising a ${trade}. Look at this photo of a real customer's space and describe it the way a designer would before proposing anything.

Return ONLY valid JSON (no markdown fences), exactly this shape:
{
  "roomType": "living room|bedroom|kitchen|dining room|hallway|office|bathroom|nursery|staircase|other",
  "style": "one of: modern, minimal, scandinavian, industrial, mid-century, traditional, rustic, coastal, art-deco, eclectic, japandi, contemporary",
  "lighting": "bright natural|soft natural|warm artificial|cool artificial|dim",
  "dominantColors": ["3-5 hex colours actually present in the photo, e.g. \\"#e8e2d9\\""],
  "materials": ["2-5 materials you can see, e.g. \\"oak\\", \\"linen\\", \\"brushed steel\\""],
  "wallWidth": estimated width in centimetres of the main empty wall or focal area,
  "wallHeight": estimated height in centimetres of that wall,
  "mood": "2-4 words in ${language} describing the feeling of the space",
  "recommendedSizes": [{"label": "single piece", "widthCm": 90, "heightCm": 120}, {"label": "pair", "widthCm": 60, "heightCm": 80}],
  "focalPoint": {"x": 0.0-1.0, "y": 0.0-1.0, "w": 0.0-1.0, "h": 0.0-1.0},
  "notes": "one sentence in ${language}: what this space is missing",
  "confidence": 0.0-1.0
}

SCALE: estimate real sizes by comparing with objects whose true size you know — a plug socket is ~8 cm, a door is ~200 cm tall and ~80 cm wide, a sofa seat is ~45 cm high, a skirting board ~10 cm, a standard ceiling is 240-270 cm. Never return 0 or an obviously impossible size.
FOCAL POINT: the normalized rectangle of the largest EMPTY wall area or the surface where a new piece would go. This is where the preview will be placed, so be precise.
HONESTY: describe only what is visible. If the photo is dark or cropped, lower "confidence" instead of inventing detail.${liveNote}${extra ? `\n\nSTUDIO BRIEF (follow it): ${extra}` : ''}`;
}

async function callVision(p: Provider, model: string, image: string, prompt: string, language: string, live = false): Promise<any> {
  const res = await fetch(p.url, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Authorization': `Bearer ${p.key}`,
      'Content-Type': 'application/json',
      ...(p.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      ...(p.extraBody ?? {}),
      ...(p.name === 'openrouter' && model.includes('reasoning') ? { reasoning: { enabled: false } } : {}),
      model,
      max_tokens: live ? 900 : 1600,
      messages: [
        {
          role: 'system',
          content: `You are an interior design vision expert. Write every human-readable value strictly in ${language}, regardless of the prompt's language. Return JSON only.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${p.name}/${model}: upstream ${res.status}`);
  const data = await res.json();
  let out: string = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error(`${p.name}/${model}: empty response`);
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!out.startsWith('{')) {
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`${p.name}/${model}: no JSON`);
    out = m[0];
  }
  const parsed = JSON.parse(out);
  if (!parsed.roomType) throw new Error(`${p.name}/${model}: bad shape`);
  return normalizeProfile(parsed, p.name, model);
}

const STYLES = ['modern', 'minimal', 'scandinavian', 'industrial', 'mid-century', 'traditional', 'rustic', 'coastal', 'art-deco', 'eclectic', 'japandi', 'contemporary'];

function normalizeProfile(raw: any, provider: string, model: string) {
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : def;
  };
  const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map((x) => String(x)) : []);
  const style = String(raw.style ?? '').toLowerCase().trim();
  const box = raw.focalPoint ?? {};
  return {
    roomType: String(raw.roomType ?? 'other').toLowerCase().slice(0, 30),
    style: STYLES.includes(style) ? style : 'contemporary',
    lighting: String(raw.lighting ?? 'soft natural').toLowerCase().slice(0, 24),
    dominantColors: arr(raw.dominantColors, 5).filter((c) => /^#[0-9a-f]{6}$/i.test(c)),
    materials: arr(raw.materials, 5),
    wallWidth: num(raw.wallWidth, 300, 40, 2000),
    wallHeight: num(raw.wallHeight, 250, 40, 800),
    mood: String(raw.mood ?? '').slice(0, 60),
    recommendedSizes: (Array.isArray(raw.recommendedSizes) ? raw.recommendedSizes : [])
      .slice(0, 3)
      .map((s: any) => ({
        label: String(s?.label ?? 'piece').slice(0, 30),
        widthCm: num(s?.widthCm, 90, 5, 600),
        heightCm: num(s?.heightCm, 120, 5, 400),
      })),
    focalPoint: {
      x: num(box.x, 0.3, 0, 1),
      y: num(box.y, 0.2, 0, 1),
      w: num(box.w, 0.4, 0.05, 1),
      h: num(box.h, 0.4, 0.05, 1),
    },
    notes: String(raw.notes ?? '').slice(0, 220),
    confidence: num(raw.confidence, 0.7, 0, 1),
    _provider: provider,
    _model: model,
  };
}

// ------------------------------------------------------- motor preporuka
// Deterministički skor: bez „crne kutije", svaki bod se može objasniti
// kupcu rečenicom. To je razlika između preporuke i pogađanja.

/** Bliskost stilova — susedni stilovi se delimično priznaju. */
const STYLE_NEIGHBOURS: Record<string, string[]> = {
  modern: ['minimal', 'contemporary', 'mid-century'],
  minimal: ['modern', 'japandi', 'scandinavian'],
  scandinavian: ['minimal', 'japandi', 'coastal'],
  industrial: ['modern', 'mid-century', 'eclectic'],
  'mid-century': ['modern', 'industrial', 'art-deco'],
  traditional: ['rustic', 'art-deco', 'eclectic'],
  rustic: ['traditional', 'coastal', 'scandinavian'],
  coastal: ['scandinavian', 'rustic', 'minimal'],
  'art-deco': ['mid-century', 'traditional', 'eclectic'],
  eclectic: ['art-deco', 'industrial', 'traditional'],
  japandi: ['minimal', 'scandinavian', 'modern'],
  contemporary: ['modern', 'minimal', 'eclectic'],
};

function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 0-1: koliko je paleta proizvoda bliska paleti prostorije. */
function colorHarmony(productColors: string[], roomColors: string[]): number {
  const a = productColors.map(hexToRgb).filter(Boolean) as [number, number, number][];
  const b = roomColors.map(hexToRgb).filter(Boolean) as [number, number, number][];
  if (!a.length || !b.length) return 0.5;
  let best = 0;
  for (const p of a) {
    for (const r of b) {
      const d = Math.sqrt((p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2 + (p[2] - r[2]) ** 2) / 441.67;
      // Savršeno poklapanje je dosadno, kontrast je haos — cilj je sredina:
      // najbolji rezultat oko 35% udaljenosti (ton u ton sa karakterom).
      const score = 1 - Math.abs(d - 0.35) / 0.65;
      if (score > best) best = score;
    }
  }
  return Math.max(0, Math.min(1, best));
}

function list(v: string | null | undefined): string[] {
  return String(v ?? '')
    .toLowerCase()
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

interface Scored {
  product: any;
  score: number;
  reasons: string[];
  parts: Record<string, number>;
}

function scoreProduct(p: any, profile: any, prefs: any): Scored {
  const parts: Record<string, number> = {};
  const reasons: string[] = [];

  // 1) Stil (30%) — najjači signal; susedni stil vredi pola
  const pStyles = list(p.style);
  const target = String(profile.style ?? '');
  let style = 0.35;
  if (pStyles.includes(target)) {
    style = 1;
    reasons.push('style');
  } else if (pStyles.some((s) => (STYLE_NEIGHBOURS[target] ?? []).includes(s))) {
    style = 0.6;
    reasons.push('style-near');
  }
  parts.style = style;

  // 2) Boja (20%)
  const color = colorHarmony(list(p.colors), profile.dominantColors ?? []);
  parts.color = color;
  if (color > 0.7) reasons.push('colour');

  // 3) Dimenzije (20%) — da li stane i da li „popunjava" zid kako treba.
  //    Pravilo struke: širina komada ≈ 60-75% širine zida/nameštaja.
  let size = 0.5;
  const wallW = Number(profile.wallWidth) || 0;
  const pw = Number(p.width_cm) || 0;
  const ph = Number(p.height_cm) || 0;
  if (wallW > 0 && pw > 0) {
    if (pw > wallW * 0.95) {
      size = 0.05;
      reasons.push('too-wide');
    } else {
      const ratio = pw / wallW;
      size = Math.max(0.15, 1 - Math.abs(ratio - 0.67) / 0.67);
      if (size > 0.75) reasons.push('fits');
    }
  }
  const wallH = Number(profile.wallHeight) || 0;
  if (wallH > 0 && ph > wallH * 0.9) size = Math.min(size, 0.1);
  parts.size = size;

  // 4) Osvetljenje (10%) — tamna soba traži svetlije i reflektujuće komade
  const lightRoom = /bright|soft natural/.test(String(profile.lighting ?? ''));
  const pTags = list(p.tags).concat(list(p.materials));
  const bright = pTags.some((t) => /light|white|pale|glass|mirror|gloss|brass|gold/.test(t));
  const dark = pTags.some((t) => /dark|black|walnut|charcoal|matte/.test(t));
  let lighting = 0.6;
  if (!lightRoom && bright) {
    lighting = 1;
    reasons.push('lifts-dark-room');
  } else if (lightRoom && dark) {
    lighting = 0.85;
    reasons.push('anchors-bright-room');
  }
  parts.lighting = lighting;

  // 5) Tip prostorije (10%)
  const rooms = list(p.room_types);
  const room = String(profile.roomType ?? '');
  const roomFit = rooms.length === 0 ? 0.6 : rooms.includes(room) ? 1 : 0.2;
  parts.room = roomFit;
  if (roomFit === 1) reasons.push('room');

  // 6) Želje kupca (5%) — budžet i omiljena boja/materijal ako ih je dao
  let pref = 0.6;
  const budget = Number(prefs?.budget) || 0;
  const price = Number(p.price) || 0;
  if (budget > 0 && price > 0) {
    pref = price <= budget ? 1 : price <= budget * 1.25 ? 0.5 : 0.05;
    if (pref === 1) reasons.push('budget');
  }
  if (prefs?.style && pStyles.includes(String(prefs.style).toLowerCase())) pref = Math.max(pref, 1);
  parts.pref = pref;

  // 7) Popularnost (5%) — blagi tie-breaker, nikad glavni razlog
  const pop = Math.min(1, (Number(p.popularity) || 0) / 50);
  parts.popularity = pop;

  const score =
    style * 0.3 + color * 0.2 + size * 0.2 + lighting * 0.1 + roomFit * 0.1 + pref * 0.05 + pop * 0.05;

  return { product: p, score: Math.round(score * 100), reasons, parts };
}

/**
 * Rečenica koju kupac čita — na NJEGOVOM jeziku i bez ijedne tehničke reči.
 * Delovi se sastavljaju iz prevedenih fragmenata, ne prevode se u hodu:
 * tako je uvek gramatički ispravno i nikad se ne meša sa engleskim.
 */
type Frag = 'head' | 'style' | 'styleNear' | 'colour' | 'fits' | 'lifts' | 'anchors' | 'budget' | 'closest' | 'and' | 'comma';

const PHRASES: Record<string, Record<Frag, string>> = {
  en: { head: 'We suggest this because ', style: 'it follows the {s} feel of your space', styleNear: "it sits close to your room's style", colour: 'the colour works with your existing palette', fits: 'the width suits the wall you photographed', lifts: 'it brightens a room with little natural light', anchors: 'it gives weight to a bright room', budget: 'it is within your budget', closest: 'it is the closest match to what you photographed', and: ' and ', comma: ', ' },
  sr: { head: 'Predlažemo ovo jer ', style: 'prati {s} stil vašeg prostora', styleNear: 'je blisko stilu vaše prostorije', colour: 'boja pristaje uz postojeću paletu', fits: 'širina odgovara zidu koji ste snimili', lifts: 'posvetljuje prostoriju sa malo prirodnog svetla', anchors: 'daje težinu svetloj prostoriji', budget: 'je u okviru vašeg budžeta', closest: 'je najbliže onome što ste snimili', and: ' i ', comma: ', ' },
  de: { head: 'Wir schlagen das vor, weil ', style: 'es den {s} Charakter Ihres Raums aufnimmt', styleNear: 'es dem Stil Ihres Raums nahekommt', colour: 'die Farbe zu Ihrer vorhandenen Palette passt', fits: 'die Breite zu der fotografierten Wand passt', lifts: 'es einen Raum mit wenig Tageslicht aufhellt', anchors: 'es einem hellen Raum Gewicht gibt', budget: 'es in Ihrem Budget liegt', closest: 'es dem Fotografierten am nächsten kommt', and: ' und ', comma: ', ' },
  fr: { head: 'Nous le proposons car ', style: 'il suit le style {s} de votre espace', styleNear: "il est proche du style de votre pièce", colour: "la couleur s'accorde à votre palette actuelle", fits: 'la largeur convient au mur photographié', lifts: 'il éclaire une pièce peu lumineuse', anchors: 'il donne du poids à une pièce lumineuse', budget: "il reste dans votre budget", closest: 'il correspond le mieux à ce que vous avez photographié', and: ' et ', comma: ', ' },
  es: { head: 'Lo proponemos porque ', style: 'sigue el estilo {s} de su espacio', styleNear: 'se acerca al estilo de su habitación', colour: 'el color encaja con su paleta actual', fits: 'el ancho se ajusta a la pared que fotografió', lifts: 'ilumina una habitación con poca luz natural', anchors: 'da peso a una habitación luminosa', budget: 'entra en su presupuesto', closest: 'es lo más parecido a lo que fotografió', and: ' y ', comma: ', ' },
  it: { head: 'Lo proponiamo perché ', style: 'segue lo stile {s} del tuo spazio', styleNear: 'è vicino allo stile della tua stanza', colour: 'il colore si accorda con la tua palette', fits: 'la larghezza si adatta alla parete che hai fotografato', lifts: 'illumina una stanza con poca luce naturale', anchors: 'dà peso a una stanza luminosa', budget: 'rientra nel tuo budget', closest: 'è la cosa più vicina a ciò che hai fotografato', and: ' e ', comma: ', ' },
  nl: { head: 'Wij stellen dit voor omdat ', style: 'het aansluit bij de {s} sfeer van uw ruimte', styleNear: 'het dicht bij de stijl van uw kamer ligt', colour: 'de kleur past bij uw huidige palet', fits: 'de breedte past bij de gefotografeerde wand', lifts: 'het een kamer met weinig daglicht opfleurt', anchors: 'het gewicht geeft aan een lichte kamer', budget: 'het binnen uw budget valt', closest: 'het het dichtst komt bij wat u fotografeerde', and: ' en ', comma: ', ' },
  pt: { head: 'Sugerimos isto porque ', style: 'segue o estilo {s} do seu espaço', styleNear: 'está próximo do estilo da sua divisão', colour: 'a cor combina com a sua paleta atual', fits: 'a largura assenta na parede que fotografou', lifts: 'ilumina uma divisão com pouca luz natural', anchors: 'dá peso a uma divisão clara', budget: 'fica dentro do seu orçamento', closest: 'é o mais próximo do que fotografou', and: ' e ', comma: ', ' },
  pl: { head: 'Proponujemy to, ponieważ ', style: 'pasuje do {s} stylu Twojego wnętrza', styleNear: 'jest bliskie stylowi Twojego pomieszczenia', colour: 'kolor współgra z Twoją obecną paletą', fits: 'szerokość pasuje do sfotografowanej ściany', lifts: 'rozjaśnia wnętrze z niewielką ilością światła dziennego', anchors: 'dodaje ciężaru jasnemu wnętrzu', budget: 'mieści się w Twoim budżecie', closest: 'najbardziej odpowiada temu, co sfotografowałeś', and: ' i ', comma: ', ' },
  sv: { head: 'Vi föreslår den här eftersom ', style: 'den följer rummets {s} känsla', styleNear: 'den ligger nära rummets stil', colour: 'färgen fungerar med din nuvarande palett', fits: 'bredden passar väggen du fotograferade', lifts: 'den lyfter ett rum med lite dagsljus', anchors: 'den ger tyngd åt ett ljust rum', budget: 'den ryms i din budget', closest: 'den ligger närmast det du fotograferade', and: ' och ', comma: ', ' },
  tr: { head: 'Bunu öneriyoruz çünkü ', style: 'mekânınızın {s} havasını sürdürüyor', styleNear: 'odanızın tarzına yakın duruyor', colour: 'rengi mevcut paletinizle uyuşuyor', fits: 'genişliği fotoğrafladığınız duvara uygun', lifts: 'doğal ışığı az olan odayı aydınlatıyor', anchors: 'aydınlık odaya ağırlık katıyor', budget: 'bütçenizin içinde kalıyor', closest: 'fotoğrafladığınıza en yakın seçenek', and: ' ve ', comma: ', ' },
  ru: { head: 'Мы предлагаем это, потому что ', style: 'это поддерживает {s} характер вашего пространства', styleNear: 'это близко к стилю вашей комнаты', colour: 'цвет сочетается с вашей нынешней палитрой', fits: 'ширина подходит к сфотографированной стене', lifts: 'это оживляет комнату с малым количеством дневного света', anchors: 'это добавляет вес светлой комнате', budget: 'это укладывается в ваш бюджет', closest: 'это ближе всего к тому, что вы сфотографировали', and: ' и ', comma: ', ' },
  ar: { head: 'نقترح هذه القطعة لأن ', style: 'تنسجم مع الطابع {s} لمساحتك', styleNear: 'قريبة من طراز غرفتك', colour: 'لونها ينسجم مع ألوانك الحالية', fits: 'عرضها مناسب للجدار الذي صوّرته', lifts: 'تضيء غرفة قليلة الإضاءة الطبيعية', anchors: 'تمنح ثقلاً لغرفة مضيئة', budget: 'ضمن ميزانيتك', closest: 'الأقرب إلى ما صوّرته', and: ' و', comma: '، ' },
};

/** Naziv stila mora biti na kupčevom jeziku — inače je rečenica mešana. */
const STYLE_NAMES: Record<string, Record<string, string>> = {
  en: {},
  sr: { modern: 'moderan', minimal: 'minimalistički', scandinavian: 'skandinavski', industrial: 'industrijski', 'mid-century': 'sredinom veka', traditional: 'tradicionalni', rustic: 'rustični', coastal: 'primorski', 'art-deco': 'art deko', eclectic: 'eklektični', japandi: 'japandi', contemporary: 'savremeni' },
  de: { modern: 'modernen', minimal: 'minimalistischen', scandinavian: 'skandinavischen', industrial: 'industriellen', 'mid-century': 'Mid-Century-', traditional: 'klassischen', rustic: 'rustikalen', coastal: 'maritimen', 'art-deco': 'Art-déco-', eclectic: 'eklektischen', japandi: 'Japandi-', contemporary: 'zeitgenössischen' },
  fr: { modern: 'moderne', minimal: 'minimaliste', scandinavian: 'scandinave', industrial: 'industriel', 'mid-century': 'mid-century', traditional: 'classique', rustic: 'rustique', coastal: 'bord de mer', 'art-deco': 'art déco', eclectic: 'éclectique', japandi: 'japandi', contemporary: 'contemporain' },
  es: { modern: 'moderno', minimal: 'minimalista', scandinavian: 'escandinavo', industrial: 'industrial', 'mid-century': 'mid-century', traditional: 'clásico', rustic: 'rústico', coastal: 'costero', 'art-deco': 'art déco', eclectic: 'ecléctico', japandi: 'japandi', contemporary: 'contemporáneo' },
  it: { modern: 'moderno', minimal: 'minimalista', scandinavian: 'scandinavo', industrial: 'industriale', 'mid-century': 'mid-century', traditional: 'classico', rustic: 'rustico', coastal: 'costiero', 'art-deco': 'art déco', eclectic: 'eclettico', japandi: 'japandi', contemporary: 'contemporaneo' },
  nl: { modern: 'moderne', minimal: 'minimalistische', scandinavian: 'Scandinavische', industrial: 'industriële', 'mid-century': 'mid-century', traditional: 'klassieke', rustic: 'landelijke', coastal: 'kust-', 'art-deco': 'art-deco', eclectic: 'eclectische', japandi: 'japandi', contemporary: 'hedendaagse' },
  pt: { modern: 'moderno', minimal: 'minimalista', scandinavian: 'escandinavo', industrial: 'industrial', 'mid-century': 'mid-century', traditional: 'clássico', rustic: 'rústico', coastal: 'costeiro', 'art-deco': 'art déco', eclectic: 'eclético', japandi: 'japandi', contemporary: 'contemporâneo' },
  pl: { modern: 'nowoczesnego', minimal: 'minimalistycznego', scandinavian: 'skandynawskiego', industrial: 'industrialnego', 'mid-century': 'mid-century', traditional: 'klasycznego', rustic: 'rustykalnego', coastal: 'nadmorskiego', 'art-deco': 'art déco', eclectic: 'eklektycznego', japandi: 'japandi', contemporary: 'współczesnego' },
  sv: { modern: 'moderna', minimal: 'minimalistiska', scandinavian: 'skandinaviska', industrial: 'industriella', 'mid-century': 'mid century-', traditional: 'klassiska', rustic: 'rustika', coastal: 'kust-', 'art-deco': 'art déco-', eclectic: 'eklektiska', japandi: 'japandi-', contemporary: 'samtida' },
  tr: { modern: 'modern', minimal: 'minimal', scandinavian: 'İskandinav', industrial: 'endüstriyel', 'mid-century': 'mid-century', traditional: 'klasik', rustic: 'rustik', coastal: 'kıyı', 'art-deco': 'art deco', eclectic: 'eklektik', japandi: 'japandi', contemporary: 'çağdaş' },
  ru: { modern: 'современный', minimal: 'минималистичный', scandinavian: 'скандинавский', industrial: 'индустриальный', 'mid-century': 'середины века', traditional: 'классический', rustic: 'рустикальный', coastal: 'морской', 'art-deco': 'ар-деко', eclectic: 'эклектичный', japandi: 'джапанди', contemporary: 'современный' },
  ar: { modern: 'العصري', minimal: 'البسيط', scandinavian: 'الإسكندنافي', industrial: 'الصناعي', 'mid-century': 'منتصف القرن', traditional: 'الكلاسيكي', rustic: 'الريفي', coastal: 'الساحلي', 'art-deco': 'آرت ديكو', eclectic: 'الانتقائي', japandi: 'جاباندي', contemporary: 'المعاصر' },
};

function styleName(style: string, lang: string): string {
  return STYLE_NAMES[lang]?.[style] ?? style;
}

function explain(s: Scored, profile: any, lang: string): string {
  const P = PHRASES[lang] ?? PHRASES.en;
  const bits: string[] = [];
  if (s.reasons.includes('style')) bits.push(P.style.replace('{s}', styleName(String(profile.style ?? ''), lang)));
  else if (s.reasons.includes('style-near')) bits.push(P.styleNear);
  if (s.reasons.includes('colour')) bits.push(P.colour);
  if (s.reasons.includes('fits')) bits.push(P.fits);
  if (s.reasons.includes('lifts-dark-room')) bits.push(P.lifts);
  if (s.reasons.includes('anchors-bright-room')) bits.push(P.anchors);
  if (s.reasons.includes('budget')) bits.push(P.budget);
  if (!bits.length) bits.push(P.closest);
  const take = bits.slice(0, 3);
  const joined =
    take.length === 1 ? take[0] : take.slice(0, -1).join(P.comma) + P.and + take[take.length - 1];
  return P.head + joined + (lang === 'ar' ? '.' : '.');
}

// ---------------------------------------------------------- obaveštenja
/**
 * Slanje mejla ide preko onoga što projekat već ima: Resend, pa Brevo.
 * Nijedno obaveštenje ne sme da obori upis u bazu — upit prvo mora da
 * bude sačuvan, pa tek onda pokušavamo da javimo. Ako mejl padne, podatak
 * i dalje čeka u CRM-u.
 */
const TEAM_EMAIL = 'partnership@safenessai.co.uk';
const FROM_NAME = 'SpaceMatch AI';

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendResend(to: string, subject: string, html: string, replyTo?: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, why: 'no_resend' };
  const attempt = async (from: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    return { status: r.status, body: await r.text() };
  };
  // Prvo sa našeg domena; ako domen još nije potvrđen u Resend nalogu,
  // pada se na njihov opšti pošiljalac da poruka ipak stigne.
  let res = await attempt(`${FROM_NAME} <partnership@safenessai.co.uk>`);
  if (res.status >= 400 && /domain|verify|not verified/i.test(res.body)) {
    res = await attempt(`${FROM_NAME} <onboarding@resend.dev>`);
  }
  return { ok: res.status < 300, why: res.body.slice(0, 200) };
}

async function sendBrevo(to: string, subject: string, html: string, replyTo?: string) {
  const key = Deno.env.get('BREVO_API_KEY');
  if (!key) return { ok: false, why: 'no_brevo' };
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(12000),
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: 'partnership@safenessai.co.uk' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  });
  return { ok: r.status < 300, why: (await r.text()).slice(0, 200) };
}

/**
 * SMTP preko naloga koji već imamo (aplikaciona lozinka). Radi ka bilo kom
 * primaocu i ne traži potvrđen domen, pa je ovo najpouzdaniji put dok se
 * safenessai.co.uk ne potvrdi kod Resend-a.
 */
async function sendSmtp(to: string, subject: string, html: string, replyTo?: string) {
  const user = Deno.env.get('GMAIL_OFFICE_EMAIL');
  const pass = Deno.env.get('GMAIL_OFFICE_APP_PASSWORD');
  if (!user || !pass) return { ok: false, why: 'no_smtp' };
  try {
    const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
    const client = new SMTPClient({
      connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: user, password: pass } },
    });
    await client.send({
      // Gmail traži da pošiljalac bude sam nalog; odgovor ide na klijenta.
      from: `${FROM_NAME} <${user}>`,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    await client.close();
    return { ok: true, why: 'smtp' };
  } catch (e: any) {
    return { ok: false, why: String(e?.message ?? e).slice(0, 200) };
  }
}

/** Ako nijedan put ne uspe, poruka ide na nalog vlasnika — nikad u prazno. */
const FALLBACK_EMAIL = 'office@aichatbot.rs';

async function notify(to: string, subject: string, html: string, replyTo?: string) {
  const tried: string[] = [];
  const paths: [string, () => Promise<{ ok: boolean; why: string }>][] = [
    ['smtp', () => sendSmtp(to, subject, html, replyTo)],
    ['resend', () => sendResend(to, subject, html, replyTo)],
    ['brevo', () => sendBrevo(to, subject, html, replyTo)],
  ];
  for (const [name, run] of paths) {
    try {
      const r = await run();
      if (r.ok) return { ok: true, via: name, why: '' };
      tried.push(`${name}: ${r.why}`);
    } catch (e: any) {
      tried.push(`${name}: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  // Poslednja odbrana: pošalji bar na nalog vlasnika, da upit ne nestane
  if (to !== FALLBACK_EMAIL) {
    const r = await sendResend(FALLBACK_EMAIL, `[${to}] ${subject}`, html, replyTo).catch(() => ({ ok: false, why: 'x' }));
    if (r.ok) return { ok: true, via: 'fallback', why: tried.join(' | ') };
  }
  console.error('notify failed:', tried.join(' | '));
  return { ok: false, via: '', why: tried.join(' | ') };
}

/** Jednostavan, čitljiv okvir — poslovni mejl, ne šarena razglednica. */
function frame(title: string, rows: [string, string][], footer = ''): string {
  const body = rows
    .filter(([, v]) => v)
    .map(([k, v]) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0;font-size:14px;color:#111827">${v}</td></tr>`)
    .join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px">
  <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#0f766e;font-weight:700;margin:0 0 6px">SpaceMatch AI</p>
  <h2 style="margin:0 0 16px;font-size:19px;color:#0b1a17">${escapeHtml(title)}</h2>
  <table style="border-collapse:collapse">${body}</table>
  ${footer ? `<p style="margin-top:18px;font-size:13px;color:#6b7280">${footer}</p>` : ''}
  <p style="margin-top:22px;font-size:11px;color:#9ca3af">Nicholas Family LTD, London</p>
</div>`;
}

// ------------------------------------------------- pisanje ponude (AI)
const LANG_NAME: Record<string, string> = {
  en: 'English', sr: 'Serbian', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian',
  nl: 'Dutch', pt: 'Portuguese', pl: 'Polish', sv: 'Swedish', tr: 'Turkish', ru: 'Russian', ar: 'Arabic',
};

interface Provider2 { name: string; key: string | undefined; url: string; models: string[]; extraHeaders?: Record<string, string>; extraBody?: Record<string, unknown> }

const TEXT_PROVIDERS: Provider2[] = [
  { name: 'nvidia', key: Deno.env.get('NVIDIA_NIM_API_KEY'), url: 'https://integrate.api.nvidia.com/v1/chat/completions', models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'], extraBody: { chat_template_kwargs: { enable_thinking: false } } },
  { name: 'gemini', key: Deno.env.get('GEMINI_API_KEY'), url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.5-flash'] },
  { name: 'openrouter', key: Deno.env.get('OPENROUTER_API_KEY'), url: 'https://openrouter.ai/api/v1/chat/completions', models: ['google/gemma-4-31b-it:free'], extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SpaceMatch AI' } },
  { name: 'groq', key: Deno.env.get('GROQ_API_KEY'), url: 'https://api.groq.com/openai/v1/chat/completions', models: ['meta-llama/llama-4-scout-17b-16e-instruct'] },
  { name: 'lovable', key: Deno.env.get('LOVABLE_API_KEY'), url: 'https://ai.gateway.lovable.dev/v1/chat/completions', models: ['google/gemini-2.5-flash'] },
];

async function askText(prompt: string): Promise<string | null> {
  for (const p of TEXT_PROVIDERS.filter((x) => x.key)) {
    for (const model of p.models) {
      try {
        const res = await fetch(p.url, {
          method: 'POST',
          signal: AbortSignal.timeout(35000),
          headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', ...(p.extraHeaders ?? {}) },
          body: JSON.stringify({
            ...(p.extraBody ?? {}),
            model,
            max_tokens: 1200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) continue;
        const d = await res.json();
        const out = d.choices?.[0]?.message?.content?.trim();
        if (out) return out;
      } catch { /* sledeći */ }
    }
  }
  return null;
}

/**
 * GOTOVE PONUDE, pisane rukom na svakom jeziku.
 *
 * Prodajni tekst se ne generiše: besplatni modeli pišu slabu gramatiku na
 * malim jezicima, a prva rečenica koju klijent pročita odlučuje o poslu.
 * AI ostaje kao opcija za personalizaciju (`ai: true`), ne kao podrazumevano.
 *
 * Zamene: {company} {contact} {link} {products} {city}
 */
interface Template { subject: string; body: string; short: string }

const TEMPLATES: Record<string, Template> = {
  en: {
    subject: '{company} — your catalogue, on your customer\'s wall',
    body: `Hello {contact},

We built a working preview for {company}. Your customer photographs their room and gets pieces from YOUR catalogue that genuinely suit the space — then sees the piece on their own wall at true size. The enquiry goes straight to you.

The preview already uses {products} of your own products, taken from your website:
{link}

It runs under your name and goes on your site with a single line of code.

Do you have fifteen minutes this week to see it from your customer's side?`,
    short: 'We built {company} a working preview: your customer photographs a room and gets pieces from your own catalogue, shown on their wall at true size. {link} — worth fifteen minutes?',
  },
  sr: {
    subject: '{company} — vaš katalog na zidu kupca',
    body: `Poštovani {contact},

Napravili smo radni prikaz za {company}. Kupac fotografiše svoju prostoriju i dobija komade iz VAŠEG kataloga koji zaista odgovaraju tom prostoru, a zatim odmah vidi komad na svom zidu u pravoj veličini. Upit stiže direktno vama.

Prikaz već koristi {products} vaših proizvoda, preuzetih sa vašeg sajta:
{link}

Radi pod vašim imenom i postavlja se na sajt jednim redom koda.

Imate li petnaest minuta ove nedelje da to vidite iz ugla kupca?`,
    short: 'Napravili smo za {company} radni prikaz: kupac fotografiše prostoriju i dobija komade iz vašeg kataloga, prikazane na njegovom zidu u pravoj veličini. {link} — vredi li petnaest minuta?',
  },
  de: {
    subject: '{company} — Ihr Sortiment an der Wand Ihrer Kunden',
    body: `Guten Tag {contact},

wir haben für {company} eine funktionierende Vorschau gebaut. Ihre Kundschaft fotografiert den eigenen Raum und erhält Stücke aus IHREM Sortiment, die wirklich dorthin passen — und sieht das Stück maßstabsgetreu an der eigenen Wand. Die Anfrage geht direkt an Sie.

Die Vorschau nutzt bereits {products} Ihrer eigenen Produkte von Ihrer Website:
{link}

Sie läuft unter Ihrem Namen und wird mit einer einzigen Codezeile eingebunden.

Hätten Sie diese Woche fünfzehn Minuten, um es aus Kundensicht anzusehen?`,
    short: 'Wir haben für {company} eine funktionierende Vorschau gebaut: Ihre Kundschaft fotografiert einen Raum und bekommt Stücke aus Ihrem Sortiment, maßstabsgetreu an der eigenen Wand. {link} — fünfzehn Minuten wert?',
  },
  fr: {
    subject: '{company} — votre catalogue sur le mur de vos clients',
    body: `Bonjour {contact},

Nous avons construit un aperçu fonctionnel pour {company}. Votre client photographie sa pièce et reçoit des articles de VOTRE catalogue qui conviennent réellement à cet espace, puis il les voit à l'échelle sur son propre mur. La demande vous parvient directement.

L'aperçu utilise déjà {products} de vos produits, repris de votre site :
{link}

Il fonctionne sous votre nom et s'ajoute à votre site avec une seule ligne de code.

Auriez-vous quinze minutes cette semaine pour le voir du côté client ?`,
    short: 'Nous avons construit pour {company} un aperçu fonctionnel : votre client photographie une pièce et reçoit des articles de votre catalogue, affichés à l\'échelle sur son mur. {link} — quinze minutes ?',
  },
  es: {
    subject: '{company} — su catálogo en la pared de sus clientes',
    body: `Buenos días {contact}:

Hemos preparado una vista previa funcional para {company}. Su cliente fotografía su habitación y recibe piezas de SU catálogo que encajan de verdad en ese espacio, y las ve a escala en su propia pared. La consulta le llega directamente a usted.

La vista previa ya utiliza {products} de sus propios productos, tomados de su web:
{link}

Funciona con su nombre y se añade a su sitio con una sola línea de código.

¿Tendría quince minutos esta semana para verlo desde el lado del cliente?`,
    short: 'Hemos preparado para {company} una vista previa funcional: su cliente fotografía una habitación y recibe piezas de su catálogo, mostradas a escala en su pared. {link} — ¿quince minutos?',
  },
  it: {
    subject: '{company} — il tuo catalogo sulla parete del cliente',
    body: `Buongiorno {contact},

abbiamo realizzato un'anteprima funzionante per {company}. Il cliente fotografa la propria stanza e riceve pezzi dal TUO catalogo che si adattano davvero a quello spazio, poi li vede in scala sulla propria parete. La richiesta arriva direttamente a te.

L'anteprima usa già {products} dei tuoi prodotti, presi dal tuo sito:
{link}

Funziona con il tuo nome e si aggiunge al sito con una sola riga di codice.

Hai quindici minuti questa settimana per vederla dal lato del cliente?`,
    short: 'Abbiamo realizzato per {company} un\'anteprima funzionante: il cliente fotografa una stanza e riceve pezzi dal tuo catalogo, mostrati in scala sulla sua parete. {link} — quindici minuti?',
  },
  nl: {
    subject: '{company} — uw collectie op de wand van uw klant',
    body: `Goedendag {contact},

Wij hebben een werkende preview gebouwd voor {company}. Uw klant fotografeert de eigen kamer en krijgt stukken uit UW collectie die echt bij die ruimte passen, en ziet het stuk op ware grootte op de eigen wand. De aanvraag komt rechtstreeks bij u binnen.

De preview gebruikt al {products} van uw eigen producten, overgenomen van uw website:
{link}

Hij draait onder uw naam en komt met één regel code op uw site.

Heeft u deze week vijftien minuten om het vanuit de klant te bekijken?`,
    short: 'Wij bouwden voor {company} een werkende preview: uw klant fotografeert een kamer en krijgt stukken uit uw collectie, op ware grootte op de eigen wand. {link} — vijftien minuten waard?',
  },
  pt: {
    subject: '{company} — o seu catálogo na parede do cliente',
    body: `Bom dia {contact},

Preparámos uma pré-visualização funcional para a {company}. O seu cliente fotografa a divisão e recebe peças do SEU catálogo que servem mesmo àquele espaço, vendo-as à escala na sua própria parede. O pedido chega diretamente a si.

A pré-visualização já usa {products} dos seus produtos, retirados do seu site:
{link}

Funciona com o seu nome e entra no site com uma única linha de código.

Tem quinze minutos esta semana para o ver do lado do cliente?`,
    short: 'Preparámos para a {company} uma pré-visualização funcional: o cliente fotografa uma divisão e recebe peças do seu catálogo, à escala na sua parede. {link} — quinze minutos?',
  },
  pl: {
    subject: '{company} — Państwa katalog na ścianie klienta',
    body: `Dzień dobry {contact},

Przygotowaliśmy działającą wersję demonstracyjną dla firmy {company}. Klient fotografuje swoje wnętrze i otrzymuje pozycje z PAŃSTWA katalogu, które naprawdę do niego pasują, a następnie widzi je w rzeczywistej skali na własnej ścianie. Zapytanie trafia bezpośrednio do Państwa.

Wersja demonstracyjna korzysta już z {products} Państwa produktów, pobranych z Państwa strony:
{link}

Działa pod Państwa marką i dodaje się do strony jedną linijką kodu.

Znaleźliby Państwo piętnaście minut w tym tygodniu, aby zobaczyć to oczami klienta?`,
    short: 'Przygotowaliśmy dla {company} działające demo: klient fotografuje wnętrze i otrzymuje pozycje z Państwa katalogu, pokazane w skali na jego ścianie. {link} — piętnaście minut?',
  },
  sv: {
    subject: '{company} — ert sortiment på kundens vägg',
    body: `Hej {contact},

Vi har byggt en fungerande förhandsvisning för {company}. Er kund fotograferar sitt rum och får produkter ur ERT sortiment som verkligen passar rummet, och ser dem i skala på sin egen vägg. Förfrågan går direkt till er.

Förhandsvisningen använder redan {products} av era egna produkter, hämtade från er webbplats:
{link}

Den körs under ert namn och läggs på webbplatsen med en enda rad kod.

Har ni femton minuter den här veckan för att se den ur kundens perspektiv?`,
    short: 'Vi byggde en fungerande förhandsvisning åt {company}: kunden fotograferar ett rum och får produkter ur ert sortiment, i skala på sin egen vägg. {link} — femton minuter?',
  },
  tr: {
    subject: '{company} — kataloğunuz müşterinizin duvarında',
    body: `Merhaba {contact},

{company} için çalışan bir önizleme hazırladık. Müşteriniz kendi odasını fotoğraflıyor ve SİZİN kataloğunuzdan o mekâna gerçekten uyan ürünleri görüyor; ardından ürünü kendi duvarında gerçek ölçeğiyle izliyor. Talep doğrudan size ulaşıyor.

Önizleme şimdiden sitenizden alınan {products} kendi ürününüzü kullanıyor:
{link}

Sizin markanız altında çalışıyor ve sitenize tek satır kodla ekleniyor.

Bu hafta müşteri gözünden görmek için on beş dakikanız olur mu?`,
    short: '{company} için çalışan bir önizleme hazırladık: müşteri odayı fotoğraflıyor ve kataloğunuzdan ürünleri kendi duvarında gerçek ölçekte görüyor. {link} — on beş dakika ayırır mısınız?',
  },
  ru: {
    subject: '{company} — ваш каталог на стене вашего клиента',
    body: `Здравствуйте, {contact}!

Мы собрали рабочую демонстрацию для компании {company}. Ваш клиент фотографирует свою комнату и получает позиции из ВАШЕГО каталога, которые действительно подходят этому пространству, а затем видит вещь на своей стене в реальном масштабе. Заявка приходит напрямую вам.

Демонстрация уже использует {products} ваших товаров, взятых с вашего сайта:
{link}

Она работает под вашим именем и добавляется на сайт одной строкой кода.

Найдётся ли у вас пятнадцать минут на этой неделе, чтобы посмотреть на это глазами клиента?`,
    short: 'Мы собрали для {company} рабочую демонстрацию: клиент фотографирует комнату и получает позиции из вашего каталога в реальном масштабе на своей стене. {link} — пятнадцать минут?',
  },
  ar: {
    subject: '{company} — كتالوجكم على جدار عميلكم',
    body: `تحية طيبة {contact}،

أعددنا نموذجاً عملياً لشركة {company}. يصوّر عميلكم غرفته فيحصل على قطع من كتالوجكم أنتم تناسب تلك المساحة فعلاً، ثم يراها بمقاسها الحقيقي على جداره. ويصلكم الطلب مباشرة.

النموذج يستخدم بالفعل {products} من منتجاتكم المأخوذة من موقعكم:
{link}

يعمل باسمكم ويُضاف إلى موقعكم بسطر برمجي واحد.

هل لديكم خمس عشرة دقيقة هذا الأسبوع لتروه من موقع العميل؟`,
    short: 'أعددنا لشركة {company} نموذجاً عملياً: يصوّر العميل غرفته فيرى قطعاً من كتالوجكم بمقاسها الحقيقي على جداره. {link} — هل تستحق خمس عشرة دقيقة؟',
  },
};

const GREETING_FALLBACK: Record<string, string> = {
  en: 'there', sr: 'kolege', de: 'zusammen', fr: 'à vous', es: 'a todos', it: 'a voi',
  nl: 'daar', pt: 'a todos', pl: 'Państwu', sv: 'ni', tr: 'merhaba', ru: 'коллеги', ar: 'فريق العمل',
};

function fillTemplate(p: any): Template | null {
  const lang = String(p.lang ?? 'en');
  const tpl = TEMPLATES[lang] ?? TEMPLATES.en;
  const vals: Record<string, string> = {
    '{company}': String(p.company ?? ''),
    '{contact}': String(p.contact_name ?? GREETING_FALLBACK[lang] ?? ''),
    '{link}': String(p.demo_url ?? 'https://safenessai.co.uk/spacematch/?t=demo'),
    '{products}': p.products_found ? String(p.products_found) : '',
    '{city}': String(p.city ?? ''),
  };
  const put = (s: string) =>
    Object.entries(vals)
      .reduce((acc, [k, v]) => acc.split(k).join(v), s)
      // Bez broja proizvoda rečenica ne sme da ostane sa duplim razmakom
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n');
  return { subject: put(tpl.subject), body: put(tpl.body), short: put(tpl.short) };
}

/**
 * Personalizovana varijanta: model prepravlja gotov tekst uz podatke o
 * firmi. Koristi se namerno — kada želimo da poruka ne liči na šablon.
 */
async function writeOutreach(p: any, tone: string, sender: string) {
  const language = LANG_NAME[String(p.lang ?? 'en')] ?? 'English';
  const link = p.demo_url ?? 'https://safenessai.co.uk/spacematch/';
  const prompt = `Write a cold outreach email in ${language} from ${sender} to a business called "${p.company}"${p.contact_name ? `, addressed to ${p.contact_name}` : ''}${p.city || p.country ? ` in ${[p.city, p.country].filter(Boolean).join(', ')}` : ''}.

WHAT WE OFFER — SpaceMatch AI:
Their customer photographs a room with a phone. Our scanner reads the room (style, light, colours, materials, the size of the free wall) and recommends the right pieces FROM THAT COMPANY'S OWN CATALOGUE, shows the piece on the customer's own wall at true scale, and sends the enquiry straight to the company. It runs under the company's own brand and is added to their website with a single line of code.
${p.demo_url ? `We have ALREADY built them a working demo using ${p.products_found ?? 'their'} products taken from their own website. The link is: ${link}` : `A live demo is available at: ${link}`}

RULES:
- Write ONLY in ${language}. Never mix languages.
- Tone: ${tone === 'warm' ? 'warm, personal, respectful' : tone === 'formal' ? 'formal and businesslike' : 'direct, confident, no fluff'}.
- Maximum 130 words in the body. Short paragraphs, no bullet lists.
- Lead with what they get, not with who we are.
- The demo link must appear exactly once, as plain text.
- One clear closing question asking for a short call.
- No emoji. No exaggerated claims. Never use the words "AI revolution" or "game changer".
- Do not invent facts about their company beyond the name and city.

Return ONLY valid JSON, no markdown:
{"subject":"under 60 characters, in ${language}","body":"the email body in ${language}, with real line breaks","short":"a 2-sentence version for LinkedIn or WhatsApp, in ${language}, including the link"}`;

  const out = await askText(prompt);
  if (!out) return null;
  let t = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!t.startsWith('{')) {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    t = m[0];
  }
  try {
    const d = JSON.parse(t);
    if (!d.subject || !d.body) return null;
    return {
      subject: String(d.subject).slice(0, 160),
      body: String(d.body).slice(0, 4000),
      short: String(d.short ?? '').slice(0, 600),
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ pomoćne
function key(len = 24): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function publicTenant(t: any) {
  // Nikada ne izlazi api_key niti bilo šta o drugim zakupcima
  return {
    slug: t.slug,
    name: t.name,
    vertical: t.vertical,
    plan: t.plan,
    logo_url: t.logo_url,
    color: t.color,
    accent: t.accent,
    headline: t.headline,
    subline: t.subline,
    contact_email: t.contact_email,
    contact_phone: t.contact_phone,
    website: t.website,
    currency: t.currency,
  };
}

/**
 * Granice moraju da odgovaraju cenovniku na stranici. Prekoračenje se ne
 * gasi nemo: klijent dobija jasnu poruku, a prekobrojna skeniranja se
 * naplaćuju po jedinici (0,03 £) — nikada se ne prekida usluga kupcu
 * usred razgledanja.
 */
const PLAN_LIMITS: Record<string, { products: number; scans: number; stores: number }> = {
  starter: { products: 150, scans: 750, stores: 1 },
  professional: { products: 1500, scans: 7500, stores: 3 },
  business: { products: 15000, scans: 40000, stores: 10 },
  enterprise: { products: 5_000_000, scans: 50_000_000, stores: 100000 },
};

/** Koliko se preko plana toleriše pre nego što se skeniranje zaustavi. */
const OVERAGE_GRACE = 1.5;

async function tenantBySlug(slug: string) {
  const s = db();
  const rows = await s`SELECT * FROM sm_tenants WHERE slug = ${slug} AND active LIMIT 1`;
  return rows[0] ?? null;
}

/** Zakupac dokazuje identitet svojim ključem — ili vlasnik platforme svojim. */
async function authTenant(body: any) {
  const admin = Deno.env.get('ADMIN_KEY');
  const s = db();
  if (admin && body.admin_key === admin && body.slug) {
    const rows = await s`SELECT * FROM sm_tenants WHERE slug = ${String(body.slug)} LIMIT 1`;
    return rows[0] ?? null;
  }
  const k = String(body.api_key ?? '');
  if (k.length < 12) return null;
  const rows = await s`SELECT * FROM sm_tenants WHERE api_key = ${k} LIMIT 1`;
  return rows[0] ?? null;
}

// ------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? '');

  try {
    await ensureTables();
    const s = db();
    const admin = Deno.env.get('ADMIN_KEY');
    const isOwner = !!admin && body.admin_key === admin;

    // ---------------------------------------------------------- JAVNO
    if (action === 'tenant') {
      const t = await tenantBySlug(String(body.slug ?? ''));
      if (!t) return json({ error: 'not found' }, 404);
      return json({ tenant: publicTenant(t) });
    }

    if (action === 'products') {
      const t = await tenantBySlug(String(body.slug ?? ''));
      if (!t) return json({ error: 'not found' }, 404);
      const rows = await s`SELECT id, sku, title, description, image_url, url, price, style, colors,
        materials, room_types, width_cm, height_cm, depth_cm, tags, popularity, model_url
        FROM sm_products WHERE tenant_id = ${t.id} AND active ORDER BY popularity DESC, id DESC LIMIT 500`;
      return json({ products: rows });
    }

    if (action === 'analyze') {
      const t = await tenantBySlug(String(body.slug ?? ''));
      if (!t) return json({ error: 'not found' }, 404);
      const image = String(body.image ?? '');
      if (!image.startsWith('data:image/')) return json({ error: 'Missing image (data URL)' }, 400);
      if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

      const limit = PLAN_LIMITS[t.plan] ?? PLAN_LIMITS.starter;
      const [{ count }] = await s`SELECT count(*)::int AS count FROM sm_scans
        WHERE tenant_id = ${t.id} AND created_at > date_trunc('month', now())`;
      // Do 50% preko plana radi i naplaćuje se; iznad toga stajemo, da
      // račun ne pobegne klijentu bez njegovog znanja.
      if (count >= Math.round(limit.scans * OVERAGE_GRACE)) {
        return json({ error: 'plan_scan_limit', limit: limit.scans, used: count }, 429);
      }

      const language = String(body.language ?? 'English').slice(0, 30);
      const live = body.live === true;
      const prompt = buildPrompt(String(t.vertical), String(t.prompt_extra ?? '').slice(0, 600), language, live);
      const active = PROVIDERS.filter((p) => p.key);
      if (!active.length) return json({ error: 'no_provider' }, 501);

      const errors: string[] = [];
      for (const p of active) {
        for (const model of p.models) {
          try {
            const profile = await callVision(p, model, image, prompt, language, live);
            await s`INSERT INTO sm_scans (tenant_id, profile)
              VALUES (${t.id}, ${s.json({ ...profile, _live: live })})`;
            return json({ profile });
          } catch (e: any) {
            errors.push(e?.message ?? String(e));
          }
        }
      }
      console.error('spacematch analyze failed:', errors.join(' | '));
      return json({ error: 'analyze_failed', detail: errors[errors.length - 1] ?? '' }, 502);
    }

    if (action === 'recommend') {
      const t = await tenantBySlug(String(body.slug ?? ''));
      if (!t) return json({ error: 'not found' }, 404);
      const profile = body.profile ?? {};
      const prefs = body.preferences ?? {};
      const lang = String(body.lang ?? 'en').slice(0, 5);
      const rows = await s`SELECT * FROM sm_products WHERE tenant_id = ${t.id} AND active LIMIT 1000`;
      const scored = rows
        .map((p: any) => scoreProduct(p, profile, prefs))
        .sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 3).map((x) => ({
        id: x.product.id,
        sku: x.product.sku,
        title: x.product.title,
        description: x.product.description,
        image_url: x.product.image_url,
        url: x.product.url,
        price: x.product.price,
        width_cm: x.product.width_cm,
        height_cm: x.product.height_cm,
        depth_cm: x.product.depth_cm,
        // Kad proizvod ima gotov 3D model, kupac ga vidi kao predmet u svom
        // prostoru; bez njega ostaje izrezana slika, koja i dalje radi.
        model_url: x.product.model_url ?? null,
        match: x.score,
        why: explain(x, profile, lang),
        parts: x.parts,
      }));
      const alternatives = scored.slice(3, 9).map((x) => ({
        id: x.product.id,
        title: x.product.title,
        image_url: x.product.image_url,
        price: x.product.price,
        width_cm: x.product.width_cm,
        height_cm: x.product.height_cm,
        depth_cm: x.product.depth_cm,
        model_url: x.product.model_url ?? null,
        match: x.score,
      }));
      await s`INSERT INTO sm_events (tenant_id, type, meta)
        VALUES (${t.id}, 'recommend', ${s.json({ room: profile.roomType, style: profile.style, top: top.map((x) => x.id) })})`;
      return json({ recommendations: top, alternatives, catalogSize: rows.length });
    }

    if (action === 'inquiry') {
      const t = await tenantBySlug(String(body.slug ?? ''));
      if (!t) return json({ error: 'not found' }, 404);
      const email = String(body.email ?? '').slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'bad email' }, 400);
      await s`INSERT INTO sm_leads (tenant_id, name, email, phone, message, product_ids, profile)
        VALUES (${t.id}, ${String(body.name ?? '').slice(0, 80)}, ${email},
                ${String(body.phone ?? '').slice(0, 40)}, ${String(body.message ?? '').slice(0, 600)},
                ${String(body.product_ids ?? '').slice(0, 120)}, ${s.json(body.profile ?? {})})`;
      await s`INSERT INTO sm_events (tenant_id, type, meta) VALUES (${t.id}, 'inquiry', ${s.json({ email })})`;

      // Studio dobija upit odmah; bez ovoga bi morao da otvara tablu.
      if (t.contact_email) {
        void notify(
          String(t.contact_email),
          `Novi upit sa skenera — ${String(body.name ?? email)}`,
          frame('Kupac je poslao upit', [
            ['Ime', escapeHtml(String(body.name ?? ''))],
            ['Email', `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`],
            ['Telefon', escapeHtml(String(body.phone ?? ''))],
            ['Poruka', escapeHtml(String(body.message ?? ''))],
            ['Prostor', escapeHtml(String((body.profile ?? {}).roomType ?? ''))],
            ['Stil', escapeHtml(String((body.profile ?? {}).style ?? ''))],
          ], `Svi upiti su u vašem studiju: <a href="https://safenessai.co.uk/spacematch/?studio=1">Enquiries</a>`),
          email,
        );
      }
      return json({ ok: true });
    }

    if (action === 'signup') {
      const email = String(body.email ?? '').trim().slice(0, 120);
      const company = String(body.company ?? '').trim().slice(0, 120);
      if (!company) return json({ error: 'company required' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'bad email' }, 400);
      const [row] = await s`INSERT INTO sm_signups (company, person, email, phone, website, vertical, catalogue_size, plan, message)
        VALUES (${company}, ${String(body.person ?? '').slice(0, 80)}, ${email},
                ${String(body.phone ?? '').slice(0, 40)}, ${String(body.website ?? '').slice(0, 160)},
                ${String(body.vertical ?? '').slice(0, 30)}, ${String(body.catalogue_size ?? '').slice(0, 30)},
                ${String(body.plan ?? '').slice(0, 30)}, ${String(body.message ?? '').slice(0, 600)})
        RETURNING id`;

      // Upis je već siguran; mejl je dodatak koji ne sme ništa da obori.
      const site = String(body.website ?? '');
      const mail = await notify(
        TEAM_EMAIL,
        `Upit za cenu — ${company}${body.plan ? ` (${body.plan})` : ''}`,
        frame(`${company} traži ponudu`, [
          ['Firma', escapeHtml(company)],
          ['Kontakt', escapeHtml(String(body.person ?? ''))],
          ['Email', `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`],
          ['Telefon', escapeHtml(String(body.phone ?? ''))],
          ['Sajt', site ? `<a href="${escapeHtml(site)}">${escapeHtml(site)}</a>` : ''],
          ['Delatnost', escapeHtml(String(body.vertical ?? ''))],
          ['Katalog', escapeHtml(String(body.catalogue_size ?? ''))],
          ['Plan', escapeHtml(String(body.plan ?? ''))],
          ['Poruka', escapeHtml(String(body.message ?? ''))],
        ], `Zahtev je i u konzoli: <a href="https://safenessai.co.uk/spacematch/?owner=1">Sales → Company requests</a>`),
        email,
      );
      await s`UPDATE sm_signups SET notified = ${mail.ok} WHERE id = ${row.id}`;
      return json({ ok: true, notified: mail.ok, why: mail.ok ? undefined : (mail as any).why });
    }

    if (action === 'track') {
      const t = await tenantBySlug(String(body.slug ?? ''));
      if (!t) return json({ ok: true });
      const type = String(body.type ?? 'view').slice(0, 24);
      await s`INSERT INTO sm_events (tenant_id, type, meta) VALUES (${t.id}, ${type}, ${s.json(body.meta ?? {})})`;
      return json({ ok: true });
    }

    // -------------------------------------------------------- ZAKUPAC
    if (action.startsWith('t-')) {
      const t = await authTenant(body);
      if (!t) return json({ error: 'unauthorized' }, 401);

      if (action === 't-me') return json({ tenant: { ...publicTenant(t), prompt_extra: t.prompt_extra, domain: t.domain } });

      if (action === 't-update') {
        const f = body.fields ?? {};
        await s`UPDATE sm_tenants SET
          name = COALESCE(${f.name ?? null}, name),
          logo_url = COALESCE(${f.logo_url ?? null}, logo_url),
          color = COALESCE(${f.color ?? null}, color),
          accent = COALESCE(${f.accent ?? null}, accent),
          headline = COALESCE(${f.headline ?? null}, headline),
          subline = COALESCE(${f.subline ?? null}, subline),
          prompt_extra = COALESCE(${f.prompt_extra ?? null}, prompt_extra),
          contact_email = COALESCE(${f.contact_email ?? null}, contact_email),
          contact_phone = COALESCE(${f.contact_phone ?? null}, contact_phone),
          website = COALESCE(${f.website ?? null}, website),
          domain = COALESCE(${f.domain ?? null}, domain),
          vertical = COALESCE(${f.vertical ?? null}, vertical),
          currency = COALESCE(${f.currency ?? null}, currency)
          WHERE id = ${t.id}`;
        return json({ ok: true });
      }

      if (action === 't-product-add') {
        const limit = PLAN_LIMITS[t.plan] ?? PLAN_LIMITS.starter;
        const [{ count }] = await s`SELECT count(*)::int AS count FROM sm_products WHERE tenant_id = ${t.id} AND active`;
        if (count >= limit.products) return json({ error: 'plan_product_limit', limit: limit.products }, 429);
        const p = body.product ?? {};
        const [row] = await s`INSERT INTO sm_products
          (tenant_id, sku, title, description, image_url, url, price, style, colors, materials,
           room_types, width_cm, height_cm, depth_cm, tags, popularity)
          VALUES (${t.id}, ${p.sku ?? null}, ${String(p.title ?? 'Untitled').slice(0, 160)},
                  ${p.description ?? null}, ${p.image_url ?? null}, ${p.url ?? null},
                  ${p.price === '' || p.price == null ? null : Number(p.price)},
                  ${p.style ?? null}, ${p.colors ?? null}, ${p.materials ?? null}, ${p.room_types ?? null},
                  ${p.width_cm ? Number(p.width_cm) : null}, ${p.height_cm ? Number(p.height_cm) : null},
                  ${p.depth_cm ? Number(p.depth_cm) : null}, ${p.tags ?? null},
                  ${p.popularity ? Number(p.popularity) : 0})
          RETURNING id`;
        return json({ ok: true, id: row.id });
      }

      if (action === 't-product-del') {
        await s`DELETE FROM sm_products WHERE id = ${Number(body.id)} AND tenant_id = ${t.id}`;
        return json({ ok: true });
      }

      if (action === 't-import') {
        // CSV uvoz kataloga: title,price,image_url,url,style,colors,materials,room_types,width_cm,height_cm,tags
        const rows = Array.isArray(body.rows) ? body.rows.slice(0, 1000) : [];
        const limit = PLAN_LIMITS[t.plan] ?? PLAN_LIMITS.starter;
        const [{ count }] = await s`SELECT count(*)::int AS count FROM sm_products WHERE tenant_id = ${t.id} AND active`;
        let added = 0;
        for (const p of rows) {
          if (count + added >= limit.products) break;
          if (!p?.title) continue;
          await s`INSERT INTO sm_products
            (tenant_id, sku, title, description, image_url, url, price, style, colors, materials,
             room_types, width_cm, height_cm, depth_cm, tags)
            VALUES (${t.id}, ${p.sku ?? null}, ${String(p.title).slice(0, 160)}, ${p.description ?? null},
                    ${p.image_url ?? null}, ${p.url ?? null},
                    ${p.price ? Number(p.price) : null}, ${p.style ?? null}, ${p.colors ?? null},
                    ${p.materials ?? null}, ${p.room_types ?? null},
                    ${p.width_cm ? Number(p.width_cm) : null}, ${p.height_cm ? Number(p.height_cm) : null},
                    ${p.depth_cm ? Number(p.depth_cm) : null}, ${p.tags ?? null})`;
          added++;
        }
        return json({ ok: true, added, skipped: rows.length - added });
      }

      if (action === 't-leads') {
        const rows = await s`SELECT id, name, email, phone, message, product_ids, created_at
          FROM sm_leads WHERE tenant_id = ${t.id} ORDER BY id DESC LIMIT 300`;
        return json({ leads: rows });
      }

      if (action === 't-stats') {
        const [tot] = await s`SELECT
          (SELECT count(*)::int FROM sm_scans WHERE tenant_id = ${t.id}) AS scans,
          (SELECT count(*)::int FROM sm_leads WHERE tenant_id = ${t.id}) AS leads,
          (SELECT count(*)::int FROM sm_products WHERE tenant_id = ${t.id} AND active) AS products,
          (SELECT count(*)::int FROM sm_events WHERE tenant_id = ${t.id} AND type = 'click') AS clicks`;
        const daily = await s`SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int AS n
          FROM sm_scans WHERE tenant_id = ${t.id} AND created_at > now() - interval '30 days'
          GROUP BY 1 ORDER BY 1`;
        const rooms = await s`SELECT profile->>'roomType' AS room, count(*)::int AS n
          FROM sm_scans WHERE tenant_id = ${t.id} AND profile->>'roomType' IS NOT NULL
          GROUP BY 1 ORDER BY n DESC LIMIT 12`;
        const styles = await s`SELECT profile->>'style' AS style, count(*)::int AS n
          FROM sm_scans WHERE tenant_id = ${t.id} AND profile->>'style' IS NOT NULL
          GROUP BY 1 ORDER BY n DESC LIMIT 12`;
        const top = await s`SELECT p.id, p.title, count(*)::int AS n
          FROM sm_events e JOIN sm_products p ON p.id = (e.meta->>'product_id')::bigint
          WHERE e.tenant_id = ${t.id} AND e.type = 'click' GROUP BY p.id, p.title ORDER BY n DESC LIMIT 10`;
        const limit = PLAN_LIMITS[t.plan] ?? PLAN_LIMITS.starter;
        return json({ totals: tot, daily, rooms, styles, topProducts: top, plan: t.plan, limits: limit });
      }

      return json({ error: 'unknown tenant action' }, 400);
    }

    // -------------------------------------------------- VLASNIK PLATFORME
    if (!isOwner) return json({ error: 'unauthorized' }, 401);

    if (action === 'create') {
      const name = String(body.name ?? '').trim().slice(0, 80);
      if (!name) return json({ error: 'name required' }, 400);
      const slug = slugify(String(body.slug ?? name)) || key(8);
      const apiKey = `sm_${key(28)}`;
      const [row] = await s`INSERT INTO sm_tenants (slug, name, vertical, plan, api_key, contact_email, color, accent)
        VALUES (${slug}, ${name}, ${String(body.vertical ?? 'art')}, ${String(body.plan ?? 'starter')},
                ${apiKey}, ${String(body.contact_email ?? '') || null},
                ${String(body.color ?? '#111827')}, ${String(body.accent ?? '#0f766e')})
        ON CONFLICT (slug) DO NOTHING RETURNING id, slug`;
      if (!row) return json({ error: 'slug_taken' }, 409);
      return json({ ok: true, slug: row.slug, api_key: apiKey });
    }

    if (action === 'delete') {
      await s`DELETE FROM sm_tenants WHERE slug = ${String(body.slug ?? '')}`;
      return json({ ok: true });
    }

    if (action === 'list') {
      const rows = await s`SELECT t.id, t.slug, t.name, t.vertical, t.plan, t.api_key, t.active, t.created_at, t.billing_status,
        (SELECT count(*)::int FROM sm_products p WHERE p.tenant_id = t.id AND p.active) AS products,
        (SELECT count(*)::int FROM sm_scans c WHERE c.tenant_id = t.id) AS scans,
        (SELECT count(*)::int FROM sm_leads l WHERE l.tenant_id = t.id) AS leads
        FROM sm_tenants t ORDER BY t.id DESC LIMIT 200`;
      return json({ tenants: rows });
    }

    if (action === 'signups') {
      const rows = await s`SELECT * FROM sm_signups ORDER BY id DESC LIMIT 300`;
      return json({ signups: rows });
    }

    if (action === 'signup-status') {
      await s`UPDATE sm_signups SET status = ${String(body.status ?? 'new').slice(0, 20)}
        WHERE id = ${Number(body.id)}`;
      return json({ ok: true });
    }

    // ---------------------------------------------------------- CRM
    if (action === 'prospects') {
      const status = String(body.status ?? '');
      const rows = status
        ? await s`SELECT * FROM sm_prospects WHERE status = ${status} ORDER BY updated_at DESC LIMIT 500`
        : await s`SELECT * FROM sm_prospects ORDER BY updated_at DESC LIMIT 500`;
      const [counts] = await s`SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'new')::int AS new,
        count(*) FILTER (WHERE demo_url IS NOT NULL)::int AS with_demo,
        count(*) FILTER (WHERE status = 'contacted')::int AS contacted,
        count(*) FILTER (WHERE status = 'replied')::int AS replied,
        count(*) FILTER (WHERE status = 'won')::int AS won,
        count(*) FILTER (WHERE next_action_at IS NOT NULL AND next_action_at <= current_date)::int AS due
        FROM sm_prospects`;
      return json({ prospects: rows, counts });
    }

    if (action === 'prospect-add') {
      const p = body.prospect ?? {};
      const company = String(p.company ?? '').trim().slice(0, 120);
      if (!company) return json({ error: 'company required' }, 400);
      const [row] = await s`INSERT INTO sm_prospects
        (company, website, country, city, vertical, lang, contact_name, email, phone, source, notes)
        VALUES (${company}, ${p.website || null}, ${p.country || null}, ${p.city || null},
                ${p.vertical || null}, ${String(p.lang || 'en').slice(0, 5)}, ${p.contact_name || null},
                ${p.email || null}, ${p.phone || null}, ${p.source || 'manual'}, ${p.notes || null})
        ON CONFLICT (lower(coalesce(website, company))) DO UPDATE SET updated_at = now()
        RETURNING id`;
      return json({ ok: true, id: row?.id });
    }

    if (action === 'prospect-import') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      let added = 0;
      for (const p of rows) {
        const company = String(p?.company ?? '').trim().slice(0, 120);
        if (!company) continue;
        const r = await s`INSERT INTO sm_prospects
          (company, website, country, city, vertical, lang, contact_name, email, phone, source, notes)
          VALUES (${company}, ${p.website || null}, ${p.country || null}, ${p.city || null},
                  ${p.vertical || null}, ${String(p.lang || 'en').slice(0, 5)}, ${p.contact_name || null},
                  ${p.email || null}, ${p.phone || null}, ${p.source || 'import'}, ${p.notes || null})
          ON CONFLICT (lower(coalesce(website, company))) DO NOTHING RETURNING id`;
        if (r.length) added++;
      }
      return json({ ok: true, added, skipped: rows.length - added });
    }

    if (action === 'prospect-update') {
      const f = body.fields ?? {};
      await s`UPDATE sm_prospects SET
        company = COALESCE(${f.company ?? null}, company),
        website = COALESCE(${f.website ?? null}, website),
        country = COALESCE(${f.country ?? null}, country),
        city = COALESCE(${f.city ?? null}, city),
        vertical = COALESCE(${f.vertical ?? null}, vertical),
        lang = COALESCE(${f.lang ?? null}, lang),
        contact_name = COALESCE(${f.contact_name ?? null}, contact_name),
        email = COALESCE(${f.email ?? null}, email),
        phone = COALESCE(${f.phone ?? null}, phone),
        status = COALESCE(${f.status ?? null}, status),
        demo_slug = COALESCE(${f.demo_slug ?? null}, demo_slug),
        demo_url = COALESCE(${f.demo_url ?? null}, demo_url),
        studio_key = COALESCE(${f.studio_key ?? null}, studio_key),
        products_found = COALESCE(${f.products_found ?? null}, products_found),
        demo_error = ${f.demo_error === undefined ? null : f.demo_error},
        notes = COALESCE(${f.notes ?? null}, notes),
        next_action_at = COALESCE(${f.next_action_at ?? null}, next_action_at),
        updated_at = now()
        WHERE id = ${Number(body.id)}`;
      return json({ ok: true });
    }

    if (action === 'prospect-del') {
      await s`DELETE FROM sm_prospects WHERE id = ${Number(body.id)}`;
      return json({ ok: true });
    }

    if (action === 'outreach') {
      const [p] = await s`SELECT * FROM sm_prospects WHERE id = ${Number(body.id)} LIMIT 1`;
      if (!p) return json({ error: 'not found' }, 404);
      // Podrazumevano ide ručno pisan šablon na jeziku primaoca; AI se
      // traži izričito i, ako zakaže, tiho se vraćamo na šablon.
      const written =
        body.ai === true
          ? (await writeOutreach(p, String(body.tone ?? 'direct'), String(body.sender ?? 'Nicholas Family LTD'))) ?? fillTemplate(p)
          : fillTemplate(p);
      if (!written) return json({ error: 'ai_unavailable' }, 502);
      await s`UPDATE sm_prospects SET outreach_subject = ${written.subject},
        outreach_body = ${written.body}, outreach_short = ${written.short}, updated_at = now()
        WHERE id = ${p.id}`;
      return json({ ok: true, ...written });
    }

    if (action === 'mail-test') {
      // Dijagnostika slanja: vraća tačan odgovor provajdera, da se ne
      // pogađa zašto mejl nije stigao.
      const to = String(body.to ?? TEAM_EMAIL);
      const html = frame('Provera slanja', [['Status', 'Ovo je test poruka.']]);
      const smtp = await sendSmtp(to, 'SpaceMatch — provera slanja', html);
      const resend = await sendResend(to, 'SpaceMatch — provera slanja', html);
      const brevo = await sendBrevo(to, 'SpaceMatch — provera slanja', html);
      return json({
        smtp, resend, brevo,
        has: {
          smtp: !!Deno.env.get('GMAIL_OFFICE_EMAIL') && !!Deno.env.get('GMAIL_OFFICE_APP_PASSWORD'),
          resend: !!Deno.env.get('RESEND_API_KEY'),
          brevo: !!Deno.env.get('BREVO_API_KEY'),
        },
      });
    }

    if (action === 'platform-stats') {
      const [tot] = await s`SELECT
        (SELECT count(*)::int FROM sm_tenants WHERE active) AS tenants,
        (SELECT count(*)::int FROM sm_products WHERE active) AS products,
        (SELECT count(*)::int FROM sm_scans) AS scans,
        (SELECT count(*)::int FROM sm_leads) AS leads,
        (SELECT count(*)::int FROM sm_signups WHERE status = 'new') AS signups`;
      const daily = await s`SELECT to_char(created_at, 'YYYY-MM-DD') AS day, count(*)::int AS n
        FROM sm_scans WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;
      return json({ totals: tot, daily });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e: any) {
    console.error('spacematch error:', e?.message ?? e);
    return json({ error: e?.message ?? 'server error' }, 500);
  }
});
