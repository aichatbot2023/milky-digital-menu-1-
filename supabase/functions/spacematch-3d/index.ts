// Proizvod sa fotografije u 3D model.
//
// Klijentov katalog su ravne slike. Tepih, lampa i fotelja se na zidu ne mogu
// prikazati kao nalepnica — kupac mora da ih vidi kao predmet u svom prostoru,
// iz svog ugla. Zato svaka fotografija proizvoda koji ima zapreminu prolazi
// kroz TRELLIS.2 (Microsoft, MIT licenca) i dobija svoj GLB.
//
// To se NE radi dok kupac čeka. Radi se jednom, pri uvozu kataloga, i model se
// čuva; kupcu posle stiže gotov fajl. Sav posao je obavljen ranije.
//
// Sam poziv grafičke kartice NE ide odavde. Funkcija ima malo memorije i
// prekine vezu posle dvadesetak sekundi, a jedan model traje minutima — pa
// generisanje vodi `tools/spacematch-3d.py` iz GitHub Actions, gde proces sme
// da čeka. Ovde ostaje knjigovodstvo: ko treba model, ko ga je dobio, i ko je
// namerno preskočen.
//
// Ravni radovi — slike, posteri, ogledala — namerno ne prolaze ovuda. Od
// fotografije uramljene slike TRELLIS pravi iskrivljenu ploču, što je gore od
// same fotografije. Njima ravan zida i perspektiva rade posao.

import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN = Deno.env.get('ADMIN_KEY') ?? '';
const HF = Deno.env.get('HF_TOKEN') ?? '';
const DB = Deno.env.get('SUPABASE_DB_URL') ?? '';
const SUPA = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const SPACE = 'https://microsoft-trellis-2.hf.space';
const BUCKET = 'spacematch-3d';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/**
 * Kome uopšte treba 3D model.
 *
 * Prva verzija je gledala reči u naslovu i oznakama i odmah se obrukala:
 * morski pejzaž sa oznakom „light" završio je kao kandidat za mesh. Delatnost
 * studija je mnogo pouzdaniji signal — galerija prodaje ravne radove, salon
 * nameštaja ne prodaje ništa ravno — pa ona odlučuje, a reči služe samo da
 * uhvate izuzetke unutar delatnosti (skulptura u galeriji, poster u salonu).
 */
const BY_VERTICAL: Record<string, boolean> = {
  art: false,
  interior: true,
  furniture: true,
  lighting: true,
  kitchen: true,
  flooring: true,
  realestate: false,
};

/** Izuzeci: ono što u svojoj delatnosti ide suprotno od pravila. */
const SOLID = /\b(sculpture|statue|figurine|bust|object|vase|bowl|skulptur|statu|figur|vazn|zdel)\b/i;
const FLAT = /\b(print|poster|artwork|painting|canvas|photograph|mirror|wallpaper|slika|poster|platno|ogledal|tapet)\b/i;

function wantsModel(p: {
  title?: string; tags?: string; style?: string; materials?: string; vertical?: string;
}) {
  const text = [p.title, p.tags, p.materials].filter(Boolean).join(' ');
  const base = BY_VERTICAL[String(p.vertical ?? '')] ?? false;
  if (base && FLAT.test(text)) return false;
  if (!base && SOLID.test(text)) return true;
  return base;
}

async function ensureBucket() {
  const r = await fetch(`${SUPA}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  // 409 znači da već postoji — to je uredu.
  if (!r.ok && r.status !== 409 && r.status !== 400) {
    throw new Error(`kanta ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* prazno telo pada ispod */ }

  if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);
  const action = String(body.action ?? '');

  // Da li je sve na svom mestu pre nego što alat krene.
  if (action === 'health') {
    return json({ ok: !!(DB && SUPA && SERVICE), token: !!HF, space: SPACE });
  }

  // Šta čeka na model. Ovo zove alat iz GitHub Actions.
  if (action === 'pending') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    const s = postgres(DB, { prepare: false });
    try {
      await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_url text`;
      await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_state text`;

      const slug = body.slug ? String(body.slug) : null;
      const limit = Math.max(1, Math.min(60, Number(body.limit) || 12));
      const rows = await s`
        SELECT p.id, p.title, p.image_url, p.tags, p.style, p.materials,
               t.slug, t.vertical
        FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
        WHERE p.active AND p.image_url IS NOT NULL AND p.model_url IS NULL
          AND (p.model_state IS NULL OR p.model_state = '')
          AND (${slug}::text IS NULL OR t.slug = ${slug})
        ORDER BY p.popularity DESC NULLS LAST, p.id
        LIMIT ${limit}`;

      // Ravni radovi se odmah obeleže kao preskočeni i ne troše tuđu karticu.
      const work: unknown[] = [];
      let skipped = 0;
      for (const p of rows) {
        if (wantsModel(p)) work.push({ id: p.id, slug: p.slug, title: p.title, image_url: p.image_url });
        else {
          await s`UPDATE sm_products SET model_state = 'skip' WHERE id = ${p.id}`;
          skipped++;
        }
      }
      return json({ work, skipped, looked_at: rows.length });
    } catch (e) {
      return json({ error: String(e).slice(0, 400) }, 500);
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  // Gotov model: stiže kao base64 iz alata, seli se u naš prostor i veže se
  // za proizvod. Tuđi privremeni link nestane za koji sat, naš ostaje.
  if (action === 'save') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    const id = Number(body.id);
    const slug = String(body.slug ?? 'x');
    const b64 = String(body.glb ?? '');
    if (!id || !b64) return json({ error: 'id i glb su obavezni' }, 400);
    const s = postgres(DB, { prepare: false });
    try {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await ensureBucket();
      const name = `${slug}/${id}.glb`;
      const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE}`,
          'Content-Type': 'model/gltf-binary',
          'x-upsert': 'true',
        },
        body: bin,
      });
      if (!up.ok) throw new Error(`smeštanje ${up.status}: ${(await up.text()).slice(0, 200)}`);
      const url = `${SUPA}/storage/v1/object/public/${BUCKET}/${name}`;
      await s`UPDATE sm_products SET model_url = ${url}, model_state = 'ready' WHERE id = ${id}`;
      return json({ ok: true, url, bytes: bin.length });
    } catch (e) {
      return json({ error: String(e).slice(0, 400) }, 500);
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  // Posao koji nije uspeo — da se ne pokušava u nedogled.
  if (action === 'fail') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    const s = postgres(DB, { prepare: false });
    try {
      await s`UPDATE sm_products SET model_state = ${String(body.reason ?? 'greška').slice(0, 200)}
              WHERE id = ${Number(body.id)}`;
      return json({ ok: true });
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  return json({ error: 'nepoznata radnja' }, 400);
});
