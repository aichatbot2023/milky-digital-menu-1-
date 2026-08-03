/**
 * partners — referral/affiliate sistem + mini CRM + BREND MARKETPLACE.
 *
 * JAVNO (bez ključa):
 *   { action: "track", type: "visit"|"signup"|"sale"|"click", ref?, meta? }
 *     - visit: neko je otvorio sajt preko ?ref=KOD
 *     - signup: registracija korisnika (meta: name, email)
 *     - sale: rezervni put za prodaju (primarni upis ide iz verify-subscription)
 *     - click: klik na partnerski proizvod (meta: product_id)
 *   { action: "products" }  → katalog partnerskih proizvoda (za aplikaciju)
 *
 * ADMIN (traži admin_key == Deno.env ADMIN_KEY):
 *   { action: "create", admin_key, code, name }  → novi partner/influenser
 *   { action: "stats", admin_key }               → CRM: po partneru posete,
 *       registracije, prodaje, prihod, konverzija + korisnici + klikovi
 *   { action: "product-add", admin_key, category, brand, title, url,
 *     price?, title_en? }                        → novi partnerski proizvod
 *   { action: "product-del", admin_key, id }     → ukloni proizvod
 *
 * Baza: Supabase Postgres preko SUPABASE_DB_URL (auto-injektovan u edge
 * funkcije); tabele se same kreiraju pri prvom pozivu.
 */
import postgres from 'npm:postgres';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

let sql: ReturnType<typeof postgres> | null = null;
let ready = false;

function db() {
  if (!sql) {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL nije dostupan');
    sql = postgres(url, { max: 2, prepare: false });
  }
  return sql;
}

async function ensureTables() {
  if (ready) return;
  const s = db();
  await s`CREATE TABLE IF NOT EXISTS sn_partners (
    code text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE TABLE IF NOT EXISTS sn_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type text NOT NULL,
    ref_code text,
    meta jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await s`CREATE INDEX IF NOT EXISTS sn_events_ref_idx ON sn_events (ref_code, type)`;
  // Brend marketplace: proizvodi partnera po kategoriji opasnosti
  await s`CREATE TABLE IF NOT EXISTS sn_products (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category text NOT NULL,
    brand text NOT NULL,
    title text NOT NULL,
    title_en text,
    url text NOT NULL,
    price text,
    keywords text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  // Postojeće baze: dodaj kolonu bez rušenja podataka
  await s`ALTER TABLE sn_products ADD COLUMN IF NOT EXISTS keywords text`;
  // Poklonjeni (free) nalozi: registracija sa ovim emailom = Premium
  await s`CREATE TABLE IF NOT EXISTS sn_gifts (
    email text PRIMARY KEY,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  ready = true;
}

// app_open (1×/dan po uređaju, meta.tz za lokaciju) i scan (meta: kind/room/
// age/cats) pune analitiku korišćenja — bez slika i bez ličnih podataka
const VALID_TYPES = new Set(['visit', 'signup', 'sale', 'click', 'app_open', 'scan']);
// Kategorije opasnosti iz aplikacije (hazard.category)
const VALID_CATEGORIES = new Set([
  'fall', 'choking', 'poisoning', 'burn', 'electric', 'cutting',
  'drowning', 'crush', 'strangulation', 'other',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = String(body?.action ?? '');

  try {
    await ensureTables();
    const s = db();

    if (action === 'track') {
      const type = String(body?.type ?? '');
      if (!VALID_TYPES.has(type)) return json({ error: 'Bad type' }, 400);
      const ref = body?.ref ? String(body.ref).slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '') : null;
      const meta = body?.meta && typeof body.meta === 'object' ? body.meta : null;
      await s`INSERT INTO sn_events (type, ref_code, meta) VALUES (${type}, ${ref}, ${meta ? s.json(meta) : null})`;
      return json({ ok: true });
    }

    if (action === 'products') {
      const products = await s`
        SELECT id, category, brand, title, title_en, url, price, keywords
        FROM sn_products WHERE active ORDER BY category, id`;
      return json({ products });
    }

    // JAVNO: da li je email na listi poklonjenih (free) naloga
    if (action === 'gift-check') {
      const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 120);
      if (!email) return json({ gift: false });
      const rows = await s`SELECT 1 FROM sn_gifts WHERE email = ${email}`;
      return json({ gift: rows.length > 0 });
    }

    // Admin akcije
    const adminKey = Deno.env.get('ADMIN_KEY');
    if (!adminKey) return json({ error: 'ADMIN_KEY nije podešen na serveru.' }, 501);
    if (String(body?.admin_key ?? '') !== adminKey) return json({ error: 'Pogrešan admin ključ' }, 401);

    if (action === 'create') {
      const code = String(body?.code ?? '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '');
      const name = String(body?.name ?? '').slice(0, 80);
      if (!code || !name) return json({ error: 'code i name su obavezni' }, 400);
      await s`INSERT INTO sn_partners (code, name) VALUES (${code}, ${name})
              ON CONFLICT (code) DO UPDATE SET name = ${name}`;
      return json({ ok: true, link: `https://safenessai.co.uk/?ref=${code}` });
    }

    if (action === 'product-add') {
      const category = String(body?.category ?? '');
      if (!VALID_CATEGORIES.has(category)) return json({ error: 'Nepoznata kategorija' }, 400);
      const brand = String(body?.brand ?? '').slice(0, 60);
      const title = String(body?.title ?? '').slice(0, 140);
      const titleEn = body?.title_en ? String(body.title_en).slice(0, 140) : null;
      const url = String(body?.url ?? '').slice(0, 500);
      const price = body?.price ? String(body.price).slice(0, 30) : null;
      // Engleske ključne reči — po njima se proizvod vezuje za konkretan nalaz
      const keywords = body?.keywords ? String(body.keywords).slice(0, 200) : null;
      if (!brand || !title || !/^https?:\/\//.test(url)) {
        return json({ error: 'brand, title i ispravan url su obavezni' }, 400);
      }
      const [row] = await s`INSERT INTO sn_products (category, brand, title, title_en, url, price, keywords)
        VALUES (${category}, ${brand}, ${title}, ${titleEn}, ${url}, ${price}, ${keywords}) RETURNING id`;
      return json({ ok: true, id: row.id });
    }

    if (action === 'product-del') {
      const id = Number(body?.id);
      if (!Number.isInteger(id)) return json({ error: 'id je obavezan' }, 400);
      await s`UPDATE sn_products SET active = false WHERE id = ${id}`;
      return json({ ok: true });
    }

    if (action === 'gift-add') {
      const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 120);
      const note = body?.note ? String(body.note).slice(0, 120) : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Neispravan email' }, 400);
      await s`INSERT INTO sn_gifts (email, note) VALUES (${email}, ${note})
              ON CONFLICT (email) DO UPDATE SET note = ${note}`;
      return json({ ok: true });
    }

    if (action === 'gift-del') {
      const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 120);
      await s`DELETE FROM sn_gifts WHERE email = ${email}`;
      return json({ ok: true });
    }

    if (action === 'stats') {
      const partners = await s`SELECT code, name, created_at FROM sn_partners ORDER BY created_at`;
      const rows = await s`
        SELECT coalesce(ref_code, '(direktno)') AS code, type, count(*)::int AS n
        FROM sn_events GROUP BY 1, 2`;
      const totals = await s`SELECT type, count(*)::int AS n FROM sn_events GROUP BY type`;
      // CRM lista: poslednji registrovani korisnici (ime + email + partner)
      const users = await s`
        SELECT meta->>'name' AS name, meta->>'email' AS email,
               coalesce(ref_code, '(direktno)') AS code, created_at
        FROM sn_events
        WHERE type = 'signup' AND meta ? 'email'
        ORDER BY created_at DESC LIMIT 500`;
      // Marketplace: svi proizvodi + broj klikova po proizvodu
      const products = await s`
        SELECT p.id, p.category, p.brand, p.title, p.url, p.price, p.keywords, p.active,
               coalesce(c.n, 0)::int AS clicks
        FROM sn_products p
        LEFT JOIN (
          -- Klik na Amazon PRETRAGU nema broj proizvoda nego reč „search".
          -- Bez ove provere pretvaranje u broj obori ceo upit, pa konzola
          -- ostane prazna zbog jednog jedinog takvog zapisa.
          SELECT pid, count(*) AS n FROM (
            SELECT CASE WHEN meta->>'product_id' ~ '^[0-9]+$'
                        THEN (meta->>'product_id')::bigint END AS pid
            FROM sn_events WHERE type = 'click'
          ) k WHERE pid IS NOT NULL GROUP BY pid
        ) c ON c.pid = p.id
        ORDER BY p.active DESC, clicks DESC, p.id`;
      // Aktivnost po danima (poslednjih 14 dana)
      const daily = await s`
        SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS d,
               type, count(*)::int AS n
        FROM sn_events
        WHERE created_at > now() - interval '14 days'
        GROUP BY 1, 2 ORDER BY 1 DESC`;
      // Šta se skenira (poslednjih 1000 skenova — agregacija na admin strani)
      const scans = await s`
        SELECT meta, created_at FROM sn_events
        WHERE type = 'scan' ORDER BY created_at DESC LIMIT 1000`;
      // Lokacije: vremenska zona uređaja iz registracija i otvaranja
      const locations = await s`
        SELECT meta->>'tz' AS tz, count(*)::int AS n
        FROM sn_events
        WHERE type IN ('signup', 'app_open', 'scan') AND meta ? 'tz' AND meta->>'tz' <> ''
        GROUP BY 1 ORDER BY n DESC LIMIT 60`;
      const gifts = await s`SELECT email, note, created_at FROM sn_gifts ORDER BY created_at DESC`;
      return json({ partners, rows, totals, users, products, daily, scans, locations, gifts });
    }

    return json({ error: 'Nepoznata akcija' }, 400);
  } catch (e: any) {
    console.error('partners error', e?.message);
    return json({ error: `Greška: ${String(e?.message ?? e).slice(0, 120)}` }, 500);
  }
});
