/**
 * spacematch-demo — od LINKA klijentovog sajta pravi GOTOV demo.
 *
 * Zalepiš adresu (npr. https://neka-galerija.rs), a funkcija:
 *   1. pročita brend sa sajta (naziv, logo, boja),
 *   2. izvuče proizvode — Shopify /products.json, WooCommerce Store API,
 *      JSON-LD Product, pa tek onda sitemap + pojedinačne stranice,
 *   3. besplatnim AI lancem dopuni svakom proizvodu stil, boje, materijale,
 *      tip prostorije i približne dimenzije (to je gorivo za preporuke),
 *   4. otvori zakupca označenog kao DEMO i vrati link koji se odmah šalje.
 *
 * Samo vlasnik platforme (ADMIN_KEY). Poštuje robots.txt, ide sa razumnim
 * brojem zahteva i uvek se gasi u nešto upotrebljivo — ako ne nađe nijedan
 * proizvod, javi to jasno umesto da napravi prazan demo.
 */
import postgres from 'npm:postgres';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UA = 'Mozilla/5.0 (compatible; SpaceMatchBot/1.0; +https://safenessai.co.uk/spacematch/)';
const MAX_PRODUCTS = 40;

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL nije dostupan');
    sql = postgres(url, { max: 3, prepare: false });
  }
  return sql;
}

// ------------------------------------------------------------- mreža
const UA_BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function once(url: string, ua: string, ms: number): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'text/html,application/json,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en,sr;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return null;
    const type = r.headers.get('content-type') ?? '';
    if (/image|video|pdf|zip/.test(type)) return null;
    const text = await r.text();
    return text.length > 4_000_000 ? text.slice(0, 4_000_000) : text;
  } catch {
    return null;
  }
}

/** Prvo se predstavljamo pošteno; ako nas sajt odbije, probamo kao pregledač. */
async function grab(url: string, ms = 12000): Promise<string | null> {
  return (await once(url, UA, ms)) ?? (await once(url, UA_BROWSER, ms));
}

function absolutize(base: string, src: string | null | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&#x27;|&apos;/g, "'").trim();
}

function strip(html: string): string {
  return decode(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).slice(0, 400);
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    'i',
  );
  const m = re.exec(html);
  return m ? decode(m[1] ?? m[2]) : null;
}

/** robots.txt: ne diramo putanje koje su izričito zabranjene za sve. */
async function disallowed(origin: string): Promise<string[]> {
  const txt = await grab(`${origin}/robots.txt`, 6000);
  if (!txt) return [];
  const out: string[] = [];
  let all = false;
  for (const line of txt.split(/\r?\n/)) {
    const l = line.trim().toLowerCase();
    if (l.startsWith('user-agent:')) all = l.includes('*');
    else if (all && l.startsWith('disallow:')) {
      const p = line.split(':').slice(1).join(':').trim();
      if (p && p !== '/') out.push(p);
    }
  }
  return out;
}

// --------------------------------------------------------------- brend
interface Brand {
  name: string;
  logo: string | null;
  accent: string;
  description: string | null;
}

function readBrand(html: string, base: string, host: string): Brand {
  const name =
    meta(html, 'og:site_name') ??
    decode((/<title[^>]*>([\s\S]{2,120})<\/title>/i.exec(html)?.[1] ?? '').split(/[|–—\-–—]/)[0]) ??
    host;
  // Logo: prvo og:logo/og:image, pa <img> sa "logo" u putanji ili alt tekstu
  const imgLogo = /<img[^>]+(?:src|data-src)=["']([^"']*logo[^"']*)["']/i.exec(html)?.[1]
    ?? /<img[^>]+alt=["'][^"']*logo[^"']*["'][^>]*(?:src|data-src)=["']([^"']+)["']/i.exec(html)?.[1];
  const logo =
    absolutize(base, imgLogo) ??
    absolutize(base, meta(html, 'og:logo')) ??
    absolutize(base, meta(html, 'og:image'));
  const theme = meta(html, 'theme-color');
  const accent = theme && /^#[0-9a-f]{6}$/i.test(theme) ? theme : '#111827';
  return { name: (name || host).slice(0, 80), logo, accent, description: meta(html, 'og:description') ?? meta(html, 'description') };
}

// ------------------------------------------------------------ proizvodi
interface Raw {
  title: string;
  description?: string | null;
  image_url?: string | null;
  url?: string | null;
  price?: number | null;
  type?: string | null;
  tags?: string | null;
}

const NOT_A_PRODUCT = /\.(jpe?g|png|webp|avif|svg|gif)$|^[\w-]*_\d{6,}|^(banner|hero|slide|cat\d|category)\b/i;

function clean(list: Raw[]): Raw[] {
  const seen = new Set<string>();
  const out: Raw[] = [];
  for (const p of list) {
    const title = (p.title ?? '').trim();
    if (title.length < 2 || title.length > 160) continue;
    // Ime fajla ili baner nije naziv proizvoda
    if (NOT_A_PRODUCT.test(title)) continue;
    const k = title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...p, title });
    if (out.length >= MAX_PRODUCTS) break;
  }
  return out;
}

/** Shopify: svaka prodavnica javno nudi /products.json — najbolji izvor. */
async function fromShopify(origin: string): Promise<Raw[]> {
  const txt = await grab(`${origin}/products.json?limit=${MAX_PRODUCTS}`);
  if (!txt || !txt.trimStart().startsWith('{')) return [];
  try {
    const d = JSON.parse(txt);
    if (!Array.isArray(d.products)) return [];
    return d.products.map((p: any) => ({
      title: p.title,
      description: p.body_html ? strip(p.body_html) : null,
      image_url: p.images?.[0]?.src ?? null,
      url: `${origin}/products/${p.handle}`,
      price: p.variants?.[0]?.price ? Number(p.variants[0].price) : null,
      type: p.product_type ?? null,
      tags: Array.isArray(p.tags) ? p.tags.join(',') : (p.tags ?? null),
    }));
  } catch {
    return [];
  }
}

/** WooCommerce Store API — javan na većini WP prodavnica. */
async function fromWoo(origin: string): Promise<Raw[]> {
  const txt = await grab(`${origin}/wp-json/wc/store/products?per_page=${MAX_PRODUCTS}`);
  if (!txt || !txt.trimStart().startsWith('[')) return [];
  try {
    const d = JSON.parse(txt);
    if (!Array.isArray(d)) return [];
    return d.map((p: any) => ({
      title: p.name,
      description: p.short_description ? strip(p.short_description) : null,
      image_url: p.images?.[0]?.src ?? null,
      url: p.permalink ?? null,
      price: p.prices?.price ? Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit ?? 2) : null,
      type: p.categories?.[0]?.name ?? null,
      tags: (p.categories ?? []).map((c: any) => c.name).join(','),
    }));
  } catch {
    return [];
  }
}

/** JSON-LD Product — standard koji koriste ozbiljne prodavnice. */
function fromJsonLd(html: string, base: string): Raw[] {
  const out: Raw[] = [];
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const type = node['@type'];
    const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
    if (isProduct && node.name) {
      const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      out.push({
        title: String(node.name),
        description: node.description ? strip(String(node.description)) : null,
        image_url: absolutize(base, Array.isArray(node.image) ? node.image[0] : (node.image?.url ?? node.image)),
        url: absolutize(base, node.url ?? offer?.url),
        price: offer?.price ? Number(String(offer.price).replace(/[^\d.]/g, '')) : null,
        type: node.category ? String(node.category) : null,
        tags: node.material ? String(node.material) : null,
      });
    }
    for (const k of ['@graph', 'itemListElement', 'mainEntity', 'item', 'hasPart']) if (node[k]) visit(node[k]);
  };
  for (const m of blocks) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      /* neispravan JSON-LD — preskoči */
    }
  }
  return out;
}

/**
 * Univerzalni izvor: čitanje same STRANICE KATEGORIJE. Većina webshopova
 * nema ni Shopify API ni JSON-LD, ali svaka kartica proizvoda je link sa
 * slikom, nazivom i cenom — to se pouzdano čita iz HTML-a.
 */
const PRICE_RE = /(?:€|£|\$|RSD|din\.?|KM|kn|zł|Kč|₺|лв)\s?\d[\d .,]{1,12}|\d[\d .,]{1,12}\s?(?:€|£|\$|RSD|din\.?|KM|kn|zł|Kč|₺|лв)/i;

function priceOf(block: string): number | null {
  const m = PRICE_RE.exec(block.replace(/<[^>]*>/g, ' '));
  if (!m) return null;
  // 1.299,00 → 1299.00 ; 1,299.00 → 1299.00
  let n = m[0].replace(/[^\d.,]/g, '');
  if (/,\d{2}$/.test(n)) n = n.replace(/\./g, '').replace(',', '.');
  else n = n.replace(/,/g, '');
  const v = Number(n);
  return Number.isFinite(v) && v > 0 && v < 10_000_000 ? v : null;
}

function imgOf(block: string): string | null {
  const src =
    /<img[^>]+(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i.exec(block)?.[1] ??
    /<img[^>]+src=["']([^"'?]+(?:\.jpe?g|\.png|\.webp|\.avif)[^"']*)["']/i.exec(block)?.[1] ??
    /<img[^>]+srcset=["']([^"',\s]+)/i.exec(block)?.[1] ??
    /<img[^>]+src=["']([^"']+)["']/i.exec(block)?.[1];
  if (!src || /^data:/.test(src) || /sprite|placeholder|logo|icon|pixel|blank/i.test(src)) return null;
  return src;
}

function fromListing(html: string, base: string): Raw[] {
  const out: Raw[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,2200}?)<\/a>/gi)) {
    const href = absolutize(base, m[1]);
    const block = m[2];
    if (!href || seen.has(href)) continue;
    const img = imgOf(block);
    if (!img) continue;
    const price = priceOf(block);
    const producty = /\/(product|products|proizvod|proizvodi|artikal|artikli|item|p|shop|collections?)\//i.test(href);
    if (!price && !producty) continue;
    // Naziv: alt slike je najčistiji, pa tek onda tekst kartice
    const alt = decode(/<img[^>]+alt=["']([^"']{3,120})["']/i.exec(block)?.[1] ?? '');
    let title = alt;
    if (!title) {
      title = strip(block).replace(PRICE_RE, '').trim().slice(0, 120);
    }
    if (title.length < 3 || /^(vidi|view|more|detalj|shop now|kupi)/i.test(title)) continue;
    seen.add(href);
    out.push({ title, image_url: absolutize(base, img), url: href, price });
    if (out.length >= MAX_PRODUCTS * 2) break;
  }
  return out;
}

/** Nađi stranice kategorija na koje vodi navigacija. */
function listingLinks(html: string, base: string, block: string[]): string[] {
  const hits = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const u = absolutize(base, m[1]);
    if (!u || !u.startsWith(new URL(base).origin)) continue;
    if (block.some((b) => u.includes(b))) continue;
    if (/\/(shop|prodavnica|categor|kategorij|collections?|proizvodi|products|namestaj|nameštaj|katalog)/i.test(u)) hits.add(u);
    if (hits.size >= 5) break;
  }
  return [...hits];
}

/** Poslednja linija: sitemap → stranice proizvoda → JSON-LD/OG sa njih. */
async function fromSitemap(origin: string, block: string[]): Promise<Raw[]> {
  const seen: string[] = [];
  const queue = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  const urls: string[] = [];
  for (const sm of queue) {
    const xml = await grab(sm, 9000);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
    // Indeks sitemapa: uđi u one koji mirišu na proizvode
    const xmls = locs.filter((u) => /\.xml/i.test(u));
    const named = xmls.filter((u) => /product|proizvod|shop|prodavnica|catalog|artik/i.test(u));
    // Bez jasnog imena ne odustajemo — zavirimo u prva tri podsitemapa
    const child = (named.length ? named : xmls).slice(0, 3);
    for (const c of child) {
      const sub = await grab(c, 9000);
      if (sub) urls.push(...[...sub.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1])));
    }
    urls.push(...locs.filter((u) => !/\.xml/i.test(u)));
    if (urls.length) break;
  }
  const allowed = urls.filter((u) => !block.some((b) => u.includes(b)));
  const looksProduct = allowed.filter((u) =>
    /\/(product|products|proizvod|proizvodi|shop|prodavnica|item|artikal|artikli|collections?|p)\//i.test(u),
  );
  const candidates = (looksProduct.length ? looksProduct : allowed).slice(0, 14);
  const out: Raw[] = [];
  for (const u of candidates) {
    if (seen.includes(u)) continue;
    seen.push(u);
    const html = await grab(u, 9000);
    if (!html) continue;
    const ld = fromJsonLd(html, u);
    if (ld.length) {
      out.push(...ld);
    } else {
      const title = meta(html, 'og:title');
      if (title) {
        out.push({
          title,
          description: meta(html, 'og:description'),
          image_url: absolutize(u, meta(html, 'og:image')),
          url: u,
          price: Number((meta(html, 'product:price:amount') ?? '').replace(/[^\d.]/g, '')) || null,
        });
      }
    }
    if (out.length >= MAX_PRODUCTS) break;
  }
  return out;
}

/**
 * Kada nijedan standard ne pomogne, stranicu čita model. HTML se prvo
 * sabije na ono što je bitno (linkovi, slike, tekst), pa se traži JSON.
 */
function compact(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s(class|style|id|data-[\w-]+|srcset|sizes|width|height|loading|role|aria-[\w-]+)=["'][^"']*["']/gi, '')
    .replace(/\s+/g, ' ')
    .slice(0, 16000);
}

async function fromAI(html: string, base: string): Promise<Raw[]> {
  const out = await ask(
    `Below is the simplified HTML of a shop page. Extract the PRODUCTS listed on it.

Return ONLY a JSON array, no markdown, max 24 items:
[{"title":"exact product name as shown","image":"image URL as written in the HTML","url":"product link as written","price":number or null}]

Rules:
- Only real products for sale. Ignore banners, categories, navigation, blog posts, cookie notices and payment logos.
- "title" must be the human product name, never a file name.
- Keep URLs exactly as they appear; do not invent any.
- If the page lists no products, return [].

HTML:
${compact(html)}`,
    2600,
  );
  const parsed = out ? extractJson(out) : null;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((p: any) => p?.title)
    .map((p: any) => ({
      title: String(p.title),
      image_url: absolutize(base, p.image),
      url: absolutize(base, p.url) ?? base,
      price: Number(p.price) || null,
    }));
}

// ------------------------------------------------- AI dopuna atributa
interface Provider { name: string; key: string | undefined; url: string; models: string[]; extraHeaders?: Record<string, string>; extraBody?: Record<string, unknown> }

const PROVIDERS: Provider[] = [
  {
    name: 'nvidia',
    key: Deno.env.get('NVIDIA_NIM_API_KEY'),
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'],
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
    models: (Deno.env.get('FREE_MODELS') ?? 'google/gemma-4-31b-it:free,nvidia/nemotron-nano-12b-v2-vl:free')
      .split(',').map((m) => m.trim()).filter(Boolean),
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

async function ask(prompt: string, maxTokens = 3000): Promise<string | null> {
  for (const p of PROVIDERS.filter((x) => x.key)) {
    for (const model of p.models) {
      try {
        const res = await fetch(p.url, {
          method: 'POST',
          signal: AbortSignal.timeout(40000),
          headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', ...(p.extraHeaders ?? {}) },
          body: JSON.stringify({
            ...(p.extraBody ?? {}),
            ...(p.name === 'openrouter' && model.includes('reasoning') ? { reasoning: { enabled: false } } : {}),
            model,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!res.ok) continue;
        const d = await res.json();
        const out = d.choices?.[0]?.message?.content?.trim();
        if (out) return out;
      } catch {
        /* sledeći provajder */
      }
    }
  }
  return null;
}

function extractJson(s: string): any {
  let t = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!t.startsWith('{') && !t.startsWith('[')) {
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (!m) return null;
    t = m[0];
  }
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * Atributi se UVEK traže na engleskom — po njima se interno poredi, a
 * kupcu se prikazuje tekst na njegovom jeziku. Ako AI padne, proizvodi
 * ostaju bez atributa i rangiranje se oslanja na tip i popularnost.
 */
/** Razumne pretpostavke kada AI zakaže — demo nikad ne sme ostati prazan. */
const DEFAULTS: Record<string, { w: number; h: number; rooms: string; style: string }> = {
  art: { w: 70, h: 90, rooms: 'living room,bedroom,hallway,office', style: 'contemporary,modern' },
  furniture: { w: 160, h: 80, rooms: 'living room,bedroom,dining room', style: 'contemporary,modern' },
  lighting: { w: 40, h: 45, rooms: 'living room,dining room,bedroom', style: 'contemporary,modern' },
  interior: { w: 120, h: 90, rooms: 'living room,bedroom', style: 'contemporary' },
  kitchen: { w: 200, h: 90, rooms: 'kitchen', style: 'modern,minimal' },
  flooring: { w: 200, h: 300, rooms: 'living room,bedroom,hallway', style: 'contemporary,rustic' },
  realestate: { w: 200, h: 100, rooms: 'living room,bedroom', style: 'contemporary' },
};

/** „60x90 cm" ili „120 x 80" u naslovu je tačnija mera od svake procene. */
function sizeFromTitle(title: string): { w: number; h: number } | null {
  const m = /(\d{2,3})\s*[x×]\s*(\d{2,3})/i.exec(title);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 4 && h > 4 && w < 900 && h < 900 ? { w, h } : null;
}

function fallbackAttrs(vertical: string, p: Raw): any {
  const d = DEFAULTS[vertical] ?? DEFAULTS.furniture;
  const size = sizeFromTitle(p.title);
  const text = `${p.title} ${p.type ?? ''} ${p.tags ?? ''}`.toLowerCase();
  const light = /white|light|pale|cream|ivory|beige|natural|oak|bela|svetl/.test(text);
  const dark = /black|dark|charcoal|walnut|graphite|crna|tamn/.test(text);
  return {
    style: d.style,
    colors: light ? '#f1ece4,#d9d2c5' : dark ? '#2b2b2b,#4a4038' : '#c8c2b8,#6f7c82',
    materials: null,
    room_types: d.rooms,
    width_cm: size?.w ?? d.w,
    height_cm: size?.h ?? d.h,
    tags: [p.tags, light ? 'light' : dark ? 'dark' : ''].filter(Boolean).join(',') || null,
  };
}

async function enrich(vertical: string, items: Raw[]): Promise<Record<number, any>> {
  const map: Record<number, any> = {};
  const CHUNK = 10;
  for (let i = 0; i < items.length; i += CHUNK) {
    const part = items.slice(i, i + CHUNK);
    const listing = part
      .map((p, j) => `${i + j}. ${p.title}${p.type ? ` [${p.type}]` : ''}${p.description ? ` — ${p.description.slice(0, 120)}` : ''}`)
      .join('\n');
    const prompt = `You are cataloguing products for a ${vertical} business so an interior recommendation engine can match them to a customer's room.

For EACH numbered product below, infer its attributes. Answer in ENGLISH only — these are internal machine labels, not customer text.

Return ONLY a JSON array, one object per product, no markdown:
[{"i":0,"style":"comma separated from: modern,minimal,scandinavian,industrial,mid-century,traditional,rustic,coastal,art-deco,eclectic,japandi,contemporary","colors":"2-3 hex colours the product most likely has, e.g. #e8e2d9,#3a2a22","materials":"1-3 materials","room_types":"comma separated from: living room,bedroom,kitchen,dining room,hallway,office,bathroom,nursery","width_cm":number,"height_cm":number,"tags":"3-6 short lowercase keywords such as light, dark, glossy, matte, wide, small"}]

Rules:
- width_cm and height_cm are the REAL typical size of this kind of product in centimetres. A framed print is 40-120 cm wide; a three-seat sofa ~220 cm; a pendant lamp ~40 cm; a rug 160-300 cm. Never return 0.
- If the title states a size (e.g. "60x90"), use those numbers.
- Guess sensibly from the name; never leave a field empty.

Products:
${listing}`;
    // Jedan ponovni pokušaj: slabiji modeli ponekad vrate krnj JSON
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await ask(prompt);
      const parsed = out ? extractJson(out) : null;
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : null;
      if (!rows) continue;
      let got = 0;
      for (const row of rows) {
        const idx = Number(row?.i);
        if (Number.isInteger(idx) && idx >= 0 && idx < items.length) {
          map[idx] = row;
          got++;
        }
      }
      if (got >= part.length - 2) break;
    }
  }
  // Sve što AI nije stigao da opiše dobija razumne pretpostavke
  for (let i = 0; i < items.length; i++) {
    const a = map[i] ?? {};
    const f = fallbackAttrs(vertical, items[i]);
    const size = sizeFromTitle(items[i].title);
    map[i] = {
      style: a.style || f.style,
      colors: a.colors || f.colors,
      materials: a.materials || f.materials,
      room_types: a.room_types || f.room_types,
      // Mera iz naslova pobeđuje i AI procenu — to je podatak, ne nagađanje
      width_cm: size?.w ?? Number(a.width_cm) ?? f.width_cm,
      height_cm: size?.h ?? Number(a.height_cm) ?? f.height_cm,
      tags: a.tags || f.tags,
      _ai: !!a.style,
    };
  }
  return map;
}

// -------------------------------------------------------------- handler
function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function key(len = 28): string {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

const VERTICAL_WORDS: [string, RegExp][] = [
  ['art', /art|gallery|print|canvas|painting|poster|slika|galerij|umetn/i],
  ['lighting', /light|lamp|luster|rasvet|svetilj|leuchte|lampe/i],
  ['kitchen', /kitchen|kuhinj|küche|cucina/i],
  ['flooring', /floor|parquet|rug|carpet|tepih|podov|laminat/i],
  ['furniture', /furnitur|sofa|namesta|nameštaj|möbel|mobili|meubel|chair|table/i],
  ['interior', /interior|design|enterijer|studio/i],
  ['realestate', /estate|property|nekretnin|immobil/i],
];

function guessVertical(text: string): string {
  for (const [v, re] of VERTICAL_WORDS) if (re.test(text)) return v;
  return 'furniture';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const admin = Deno.env.get('ADMIN_KEY');
  if (!admin || body.admin_key !== admin) return json({ error: 'unauthorized' }, 401);

  let site: URL;
  try {
    site = new URL(String(body.website ?? '').trim().replace(/^(?!https?:)/, 'https://'));
    if (!/^https?:$/.test(site.protocol)) throw new Error('protocol');
  } catch {
    return json({ error: 'bad_url' }, 400);
  }
  const origin = site.origin;

  try {
    const s = db();
    const block = await disallowed(origin);
    let home = await grab(site.toString(), 15000);
    if (!home) {
      // www.primer.rs ↔ primer.rs — česta razlika koja obara ceo pokušaj
      const alt = new URL(site.toString());
      alt.hostname = alt.hostname.startsWith('www.') ? alt.hostname.slice(4) : `www.${alt.hostname}`;
      home = await grab(alt.toString(), 15000);
      if (home) site = alt;
    }
    if (!home) return json({ error: 'site_unreachable' }, 502);

    const brand = readBrand(home, site.toString(), site.hostname.replace(/^www\./, ''));
    const vertical = String(body.vertical ?? '') || guessVertical(`${brand.name} ${brand.description ?? ''} ${site.hostname}`);

    // Izvori idu od najboljeg ka najslabijem; staje se čim ima dovoljno
    let raw: Raw[] = clean(await fromShopify(origin));
    let source = 'shopify';
    if (raw.length < 4) { const w = clean(await fromWoo(origin)); if (w.length > raw.length) { raw = w; source = 'woocommerce'; } }
    if (raw.length < 4) { const j = clean(fromJsonLd(home, site.toString())); if (j.length > raw.length) { raw = j; source = 'json-ld'; } }
    if (raw.length < 4) {
      // Kartice sa početne, pa sa stranica kategorija na koje vodi meni
      const cards: Raw[] = fromListing(home, site.toString());
      for (const link of listingLinks(home, site.toString(), block)) {
        if (cards.length >= MAX_PRODUCTS) break;
        const page = await grab(link, 12000);
        if (page) cards.push(...fromJsonLd(page, link), ...fromListing(page, link));
      }
      const c = clean(cards);
      if (c.length > raw.length) { raw = c; source = 'listing'; }
    }
    if (raw.length < 4) { const sm = clean(await fromSitemap(origin, block)); if (sm.length > raw.length) { raw = sm; source = 'sitemap'; } }
    if (raw.length < 4) {
      // Poslednja instanca: model čita početnu i prvu stranicu kategorije
      const pages = [home];
      const [first] = listingLinks(home, site.toString(), block);
      if (first) {
        const page = await grab(first, 12000);
        if (page) pages.push(page);
      }
      const found: Raw[] = [];
      for (const pg of pages) found.push(...(await fromAI(pg, site.toString())));
      const a = clean(found);
      if (a.length > raw.length) { raw = a; source = 'ai-read'; }
    }

    if (raw.length === 0) {
      return json({ error: 'no_products', brand, vertical, hint: 'Sajt ne izlaže proizvode mašinski — ubaci CSV ili nekoliko komada ručno.' }, 422);
    }

    if (body.dry === true) {
      return json({ ok: true, dry: true, brand, vertical, source, products: raw.length, sample: raw.slice(0, 8) });
    }

    const attrs = body.enrich === false ? {} : await enrich(vertical, raw);

    // Zakupac: demo se uvek pravi ispod jedinstvenog sluga
    const base = slugify(brand.name) || slugify(site.hostname);
    let slug = `${base}-demo`;
    const [taken] = await s`SELECT 1 AS x FROM sm_tenants WHERE slug = ${slug} LIMIT 1`;
    if (taken) slug = `${base}-${key(4)}`;
    const apiKey = `sm_${key(28)}`;

    await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false`;
    await s`ALTER TABLE sm_tenants ADD COLUMN IF NOT EXISTS source_url text`;

    const [tenant] = await s`INSERT INTO sm_tenants
      (slug, name, vertical, plan, api_key, logo_url, accent, website, contact_email, demo, source_url)
      VALUES (${slug}, ${brand.name}, ${vertical}, 'professional', ${apiKey}, ${brand.logo},
              ${brand.accent}, ${origin}, ${String(body.contact_email ?? '') || null}, true, ${site.toString()})
      RETURNING id`;

    let added = 0;
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      const a = attrs[i] ?? {};
      await s`INSERT INTO sm_products
        (tenant_id, title, description, image_url, url, price, style, colors, materials, room_types,
         width_cm, height_cm, tags, popularity)
        VALUES (${tenant.id}, ${p.title.slice(0, 160)}, ${p.description ?? null}, ${p.image_url ?? null},
                ${p.url ?? origin}, ${p.price ?? null},
                ${a.style ?? null}, ${a.colors ?? null}, ${a.materials ?? null},
                ${a.room_types ?? null},
                ${Number(a.width_cm) || null}, ${Number(a.height_cm) || null},
                ${a.tags ?? p.tags ?? null}, ${raw.length - i})`;
      added++;
    }

    return json({
      ok: true,
      slug,
      api_key: apiKey,
      demo_url: `https://safenessai.co.uk/spacematch/?t=${slug}`,
      brand,
      vertical,
      source,
      products: added,
      enriched: Object.values(attrs).filter((a: any) => a?._ai).length,
    });
  } catch (e: any) {
    console.error('spacematch-demo:', e?.message ?? e);
    return json({ error: e?.message ?? 'server error' }, 500);
  }
});
