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
 * JAVNO:   tenant, products, analyze, recommend, inquiry, track
 * ZAKUPAC: t-stats, t-leads, t-product-add, t-product-del, t-import,
 *          t-update (brend, prompt, kontakt)
 * VLASNIK: list, create, delete, platform-stats
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
function buildPrompt(vertical: string, extra: string, language: string): string {
  const trade = VERTICAL_EN[vertical] ?? VERTICAL_EN.art;
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
HONESTY: describe only what is visible. If the photo is dark or cropped, lower "confidence" instead of inventing detail.${extra ? `\n\nSTUDIO BRIEF (follow it): ${extra}` : ''}`;
}

async function callVision(p: Provider, model: string, image: string, prompt: string, language: string): Promise<any> {
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
      max_tokens: 1600,
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

/** Rečenica koju kupac čita — bez ijedne tehničke reči o AI-u. */
function explain(s: Scored, profile: any, lang: string): string {
  const sr = lang === 'sr';
  const bits: string[] = [];
  if (s.reasons.includes('style')) bits.push(sr ? `prati ${profile.style} stil vašeg prostora` : `it follows the ${profile.style} feel of your space`);
  else if (s.reasons.includes('style-near')) bits.push(sr ? 'blisko je stilu vašeg prostora' : 'it sits close to your room’s style');
  if (s.reasons.includes('colour')) bits.push(sr ? 'boja se slaže sa postojećom paletom' : 'the colour works with your existing palette');
  if (s.reasons.includes('fits')) bits.push(sr ? 'širina odgovara zidu koji ste snimili' : 'the width suits the wall you photographed');
  if (s.reasons.includes('lifts-dark-room')) bits.push(sr ? 'posvetljuje prostor sa malo prirodnog svetla' : 'it brightens a room with little natural light');
  if (s.reasons.includes('anchors-bright-room')) bits.push(sr ? 'daje težinu svetloj prostoriji' : 'it gives weight to a bright room');
  if (s.reasons.includes('budget')) bits.push(sr ? 'u okviru je vašeg budžeta' : 'it is within your budget');
  if (!bits.length) bits.push(sr ? 'najbliže je onome što ste snimili' : 'it is the closest match to what you photographed');
  const head = sr ? 'Predlažemo ovo jer ' : 'We suggest this because ';
  const joined = bits.length > 1
    ? bits.slice(0, 2).join(', ') + (bits[2] ? (sr ? ' i ' : ' and ') + bits[2] : '')
    : bits[0];
  return head + joined + '.';
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

const PLAN_LIMITS: Record<string, { products: number; scans: number }> = {
  starter: { products: 50, scans: 300 },
  professional: { products: 500, scans: 3000 },
  business: { products: 5000, scans: 25000 },
  enterprise: { products: 1_000_000, scans: 10_000_000 },
};

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
        materials, room_types, width_cm, height_cm, depth_cm, tags, popularity
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
      if (count >= limit.scans) return json({ error: 'plan_scan_limit', limit: limit.scans }, 429);

      const language = String(body.language ?? 'English').slice(0, 30);
      const prompt = buildPrompt(String(t.vertical), String(t.prompt_extra ?? '').slice(0, 600), language);
      const active = PROVIDERS.filter((p) => p.key);
      if (!active.length) return json({ error: 'no_provider' }, 501);

      const errors: string[] = [];
      for (const p of active) {
        for (const model of p.models) {
          try {
            const profile = await callVision(p, model, image, prompt, language);
            await s`INSERT INTO sm_scans (tenant_id, profile) VALUES (${t.id}, ${s.json(profile)})`;
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
      return json({ ok: true });
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
      const rows = await s`SELECT t.id, t.slug, t.name, t.vertical, t.plan, t.api_key, t.active, t.created_at,
        (SELECT count(*)::int FROM sm_products p WHERE p.tenant_id = t.id AND p.active) AS products,
        (SELECT count(*)::int FROM sm_scans c WHERE c.tenant_id = t.id) AS scans,
        (SELECT count(*)::int FROM sm_leads l WHERE l.tenant_id = t.id) AS leads
        FROM sm_tenants t ORDER BY t.id DESC LIMIT 200`;
      return json({ tenants: rows });
    }

    if (action === 'platform-stats') {
      const [tot] = await s`SELECT
        (SELECT count(*)::int FROM sm_tenants WHERE active) AS tenants,
        (SELECT count(*)::int FROM sm_products WHERE active) AS products,
        (SELECT count(*)::int FROM sm_scans) AS scans,
        (SELECT count(*)::int FROM sm_leads) AS leads`;
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
