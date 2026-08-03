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
 * Vrste proizvoda koje ima smisla praviti u 3D.
 *
 * Sve što je u suštini ravna površina ostaje slika: model bi mu samo dodao
 * lažnu debljinu i iskrivio ivice.
 */
const FLAT = /(print|poster|artwork|painting|canvas|photograph|mirror|wallpaper|tile|slika|poster|platno|ogledal|tapet|plocic|pločic)/i;
const VOLUME = /(sofa|chair|armchair|stool|table|desk|lamp|light|pendant|rug|carpet|vase|planter|shelf|cabinet|bed|bench|kaus|stolic|stolic|fotelj|lampa|tepih|vazn|polic|orman|krevet|klupa)/i;

/** Da li proizvod uopšte treba da ima 3D model. */
function wantsModel(p: { title?: string; tags?: string; style?: string; materials?: string }) {
  const text = [p.title, p.tags, p.style, p.materials].filter(Boolean).join(' ');
  if (FLAT.test(text) && !VOLUME.test(text)) return false;
  return VOLUME.test(text);
}

/**
 * Razgovor sa Space-om ide preko reda čekanja, ne preko REST prečice.
 *
 * `/gradio_api/call/...` izgleda jednostavnije, ali ne podnosi sesijsko
 * stanje — a ovaj Space upravo tako radi: `image_to_3d` ostavlja rezultat u
 * sesiji, a `extract_glb` ga odatle uzima. Preko prečice svaki korak vrati
 * „404". Zato se posao prijavljuje u red i sluša se jedan tok događaja za
 * celu sesiju, isto kako radi i zvanični klijent.
 */
const FN = { start_session: 2, preprocess_image: 4, image_to_3d: 7, extract_glb: 9 } as const;

/** Iznad ovoga se odgovor ne čuva — funkcija ima malo memorije. */
const MAX_PAYLOAD = 512 * 1024;

async function call(
  endpoint: keyof typeof FN,
  data: unknown[],
  session: string,
  ms = 240000,
  /**
   * Da li nam ishod uopšte treba.
   *
   * `image_to_3d` uz rezultat vraća i video pregled zapakovan u sam odgovor —
   * desetine megabajta koje funkciji sruše memoriju. Taj korak ostavlja ono
   * što nam treba u sesiji, pa se njegov odgovor samo preskoči.
   */
  wantOutput = true,
): Promise<unknown[]> {
  const head: Record<string, string> = { 'Content-Type': 'application/json' };
  if (HF) head.Authorization = `Bearer ${HF}`;

  const join = await fetch(`${SPACE}/gradio_api/queue/join`, {
    method: 'POST',
    headers: head,
    body: JSON.stringify({
      data,
      event_data: null,
      fn_index: FN[endpoint],
      trigger_id: null,
      session_hash: session,
    }),
  });
  const joined = await join.text();
  if (!join.ok) throw new Error(`${endpoint} prijava ${join.status}: ${joined.slice(0, 240)}`);
  const eventId = JSON.parse(joined)?.event_id;
  if (!eventId) throw new Error(`${endpoint}: nema event_id — ${joined.slice(0, 200)}`);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(`${SPACE}/gradio_api/queue/data?session_hash=${session}`, {
      headers: HF ? { Authorization: `Bearer ${HF}`, Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
      signal: ctl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`${endpoint} tok ${res.status}`);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let dropped = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });

      // Kad ishod ne čuvamo, dovoljno je videti da je posao gotov.
      if (!wantOutput) {
        buf = (buf + chunk).slice(-4096);
        if (buf.includes('"msg": "process_completed"') || buf.includes('"msg":"process_completed"')) {
          reader.cancel().catch(() => {});
          if (buf.includes('"success": false') || buf.includes('"success":false')) {
            throw new Error(`${endpoint}: posao nije uspeo`);
          }
          return [];
        }
        if (buf.includes('unexpected_error')) {
          reader.cancel().catch(() => {});
          throw new Error(`${endpoint}: neočekivana greška`);
        }
        continue;
      }

      buf += chunk;
      if (buf.length > MAX_PAYLOAD) {
        // Ogroman red bez prelaza znači da stiže nešto što nismo tražili.
        buf = buf.slice(-MAX_PAYLOAD);
        dropped = true;
      }
      let cut: number;
      while ((cut = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, cut).trimEnd();
        buf = buf.slice(cut + 1);
        if (!line.startsWith('data:')) continue;
        let msg: any;
        try {
          msg = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (msg?.msg === 'process_completed' && (!msg.event_id || msg.event_id === eventId)) {
          reader.cancel().catch(() => {});
          if (msg.success === false) {
            const why = msg.output?.error ?? msg.output?.detail ?? JSON.stringify(msg.output ?? msg).slice(0, 260);
            throw new Error(`${endpoint}: ${String(why).slice(0, 300)}`);
          }
          return (msg.output?.data ?? []) as unknown[];
        }
        if (msg?.msg === 'unexpected_error' || msg?.msg === 'close_stream') {
          reader.cancel().catch(() => {});
          throw new Error(`${endpoint}: ${String(msg.message ?? msg.msg).slice(0, 240)}`);
        }
      }
    }
    throw new Error(`${endpoint}: tok se prekinuo bez ishoda${dropped ? ' (odgovor prevelik)' : ''}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Nasumičan ključ sesije — Space vezuje korake jednog posla za njega. */
const newSession = () => crypto.randomUUID().replace(/-/g, '').slice(0, 11);

/**
 * Slika se otprema Space-u, ne šalje kao link.
 *
 * Link sa našeg domena Space odbija bez objašnjenja — verovatno ga uopšte i
 * ne dohvata. Otpremanje vraća putanju na njegovom disku i posle radi svaki
 * put, pa je to jedini pouzdan put.
 */
async function upload(imageUrl: string) {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`slika proizvoda ${img.status}`);
  const blob = await img.blob();

  const form = new FormData();
  form.append('files', blob, 'product.jpg');
  const up = await fetch(`${SPACE}/gradio_api/upload`, {
    method: 'POST',
    headers: HF ? { Authorization: `Bearer ${HF}` } : {},
    body: form,
  });
  const text = await up.text();
  if (!up.ok) throw new Error(`otpremanje ${up.status}: ${text.slice(0, 200)}`);
  const path = JSON.parse(text)?.[0];
  if (!path) throw new Error(`otpremanje bez putanje: ${text.slice(0, 160)}`);
  return { path, url: null, orig_name: 'product.jpg', mime_type: 'image/jpeg',
           meta: { _type: 'gradio.FileData' } };
}

/**
 * Jedan proizvod: fotografija → pripremljena slika → 3D → GLB.
 *
 * Rezolucija je namerno 512: na deljenoj grafičkoj kartici veće traje minutima
 * i troši tuđu kvotu, a razlika se na telefonu ne vidi.
 */
async function build(imageUrl: string, resolution = '512') {
  const session = newSession();
  await call('start_session', [], session, 30000, false);

  const pre = await call('preprocess_image', [await upload(imageUrl)], session, 120000);
  const cleaned = (pre?.[0] ?? null) as { url?: string; path?: string } | null;
  if (!cleaned?.url && !cleaned?.path) throw new Error('priprema slike nije vratila sliku');

  // Petnaest brojeva iza slike su tri grupe podešavanja koje Space traži
  // (oblik, materijal, doterivanje). Vrednosti su njegove podrazumevane;
  // menja se samo rezolucija, jer 1024 na deljenoj kartici traje minutima.
  await call(
    'image_to_3d',
    [cleaned, 0, resolution, 7.5, 0.7, 12, 5, 7.5, 0.5, 12, 3, 1, 0, 12, 3],
    session,
    300000,
    false,
  );

  // Prva vrednost je sesijsko stanje koje Space sam popunjava, pa ide null.
  // Mreža i tekstura su na donjoj granici: model se gleda na telefonu.
  const out = await call('extract_glb', [null, 100000, 1024], session, 180000);
  const glb = (out?.[0] ?? null) as { url?: string } | null;
  if (!glb?.url) throw new Error('izvlačenje GLB-a nije vratilo fajl');
  return glb.url;
}

/** GLB se seli na naš prostor: tuđi privremeni link nestaje za koji sat. */
async function store(url: string, name: string) {
  const res = await fetch(url, { headers: HF ? { Authorization: `Bearer ${HF}` } : {} });
  if (!res.ok) throw new Error(`preuzimanje GLB-a ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());

  const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'model/gltf-binary',
      'x-upsert': 'true',
    },
    body,
  });
  if (!up.ok) throw new Error(`smeštanje ${up.status}: ${(await up.text()).slice(0, 200)}`);
  return { url: `${SUPA}/storage/v1/object/public/${BUCKET}/${name}`, bytes: body.length };
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

  // Provera da li nam Space uopšte da vremena na grafičkoj kartici.
  if (action === 'health') {
    try {
      const s = newSession();
      await call('start_session', [], s, 30000);
      return json({ ok: true, token: !!HF, space: SPACE });
    } catch (e) {
      return json({ ok: false, token: !!HF, error: String(e).slice(0, 400) }, 502);
    }
  }

  // Jedna slika, bez baze — za probu i za ručne slučajeve.
  if (action === 'one') {
    const image = String(body.image_url ?? '');
    if (!image) return json({ error: 'image_url je obavezan' }, 400);
    try {
      const glb = await build(image, String(body.resolution ?? '512'));
      if (body.keep === false) return json({ glb });
      await ensureBucket();
      const saved = await store(glb, `${body.name ?? crypto.randomUUID()}.glb`);
      return json(saved);
    } catch (e) {
      return json({ error: String(e).slice(0, 500) }, 502);
    }
  }

  // Katalog jednog studija: pravi modele za proizvode kojima 3D ima smisla.
  if (action === 'catalogue') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    const s = postgres(DB, { prepare: false });
    try {
      await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_url text`;
      await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_state text`;

      const slug = String(body.slug ?? '');
      const limit = Math.max(1, Math.min(20, Number(body.limit) || 3));
      const rows = await s`
        SELECT p.id, p.title, p.image_url, p.tags, p.style, p.materials
        FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
        WHERE t.slug = ${slug} AND p.active AND p.image_url IS NOT NULL
          AND p.model_url IS NULL AND (p.model_state IS NULL OR p.model_state <> 'skip')
        ORDER BY p.popularity DESC NULLS LAST, p.id
        LIMIT ${limit}`;

      await ensureBucket();
      const done: string[] = [];
      const skipped: string[] = [];
      const failed: string[] = [];

      for (const p of rows) {
        if (!wantsModel(p)) {
          await s`UPDATE sm_products SET model_state = 'skip' WHERE id = ${p.id}`;
          skipped.push(p.title);
          continue;
        }
        try {
          const glb = await build(p.image_url, '512');
          const saved = await store(glb, `${slug}/${p.id}.glb`);
          await s`UPDATE sm_products SET model_url = ${saved.url}, model_state = 'ready'
                  WHERE id = ${p.id}`;
          done.push(p.title);
        } catch (e) {
          await s`UPDATE sm_products SET model_state = ${String(e).slice(0, 200)}
                  WHERE id = ${p.id}`;
          failed.push(`${p.title}: ${String(e).slice(0, 160)}`);
        }
      }
      return json({ done, skipped, failed, looked_at: rows.length });
    } catch (e) {
      return json({ error: String(e).slice(0, 400) }, 500);
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  return json({ error: 'nepoznata radnja' }, 400);
});
