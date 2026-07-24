/**
 * partners — referral/affiliate sistem + mini CRM.
 *
 * JAVNO (bez ključa):
 *   { action: "track", type: "visit"|"signup"|"sale", ref?: "KOD" }
 *     - visit: neko je otvorio sajt preko ?ref=KOD
 *     - signup: novi korisnik pokrenuo aplikaciju (početak probnog perioda)
 *     - sale: rezervni put za prodaju (primarni upis ide iz verify-subscription)
 *
 * ADMIN (traži admin_key == Deno.env ADMIN_KEY):
 *   { action: "create", admin_key, code, name }  → novi partner/influenser
 *   { action: "stats", admin_key }               → CRM: po partneru posete,
 *       registracije, prodaje, prihod, konverzija + ukupni brojevi
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
  ready = true;
}

const VALID_TYPES = new Set(['visit', 'signup', 'sale']);

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
      return json({ partners, rows, totals, users });
    }

    return json({ error: 'Nepoznata akcija' }, 400);
  } catch (e: any) {
    console.error('partners error', e?.message);
    return json({ error: `Greška: ${String(e?.message ?? e).slice(0, 120)}` }, 500);
  }
});
