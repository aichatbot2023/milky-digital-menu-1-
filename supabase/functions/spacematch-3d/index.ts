// Proizvod sa fotografije u 3D model.
//
// Klijentov katalog su ravne slike. Tepih, lampa i fotelja se na zidu ne mogu
// prikazati kao nalepnica — kupac mora da ih vidi kao predmet u svom prostoru,
// iz svog ugla. Zato fotografija takvog proizvoda prolazi kroz TRELLIS.2
// (Microsoft, MIT licenca) i dobija svoj GLB.
//
// Posao se NE radi dok kupac čeka. Radi se jednom, model se čuva kod nas, a
// kupcu posle stiže gotov fajl.
//
// Sve se odvija unutar Supabase-a: token za grafičku karticu već stoji ovde,
// pa ne treba ni GitHub tajna, ni ručno pokretanje, ni bilo šta sa strane.
// Odgovor se vraća odmah, a posao se nastavlja u pozadini
// (`EdgeRuntime.waitUntil`); stanje svakog proizvoda stoji u bazi, pa ako se
// izvršavanje prekine na pola, sledeći poziv nastavlja gde je stalo.

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

/** Posao koji stoji duže od ovoga je pao usput — sme ponovo. */
const STALE_MINUTES = 20;

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
  title?: string; tags?: string; materials?: string; vertical?: string;
}) {
  const text = [p.title, p.tags, p.materials].filter(Boolean).join(' ');
  const base = BY_VERTICAL[String(p.vertical ?? '')] ?? false;
  if (base && FLAT.test(text)) return false;
  if (!base && SOLID.test(text)) return true;
  return base;
}

/* ------------------------------------------------------ razgovor sa Space-om */

const FN = { start_session: 2, preprocess_image: 4, image_to_3d: 7, extract_glb: 9 } as const;

const auth = () => (HF ? { Authorization: `Bearer ${HF}` } : {});

/**
 * Razgovor sa jednom sesijom Space-a.
 *
 * Ovde su četiri zamke koje se ne vide iz dokumentacije, a svaka je oborila
 * po jednu verziju:
 *
 * 1. REST prečica `/gradio_api/call/...` ne podnosi sesijsko stanje, a Space
 *    upravo tako radi — `image_to_3d` ostavi rezultat u sesiji, `extract_glb`
 *    ga odatle uzme. Preko prečice svaki korak vrati „404".
 * 2. Sesiju stvara prva prijava posla, ne otvaranje toka. Otvoriš li tok
 *    prvi, dobiješ „session_not_found".
 * 3. `close_stream` NIJE greška. Gradio zatvori tok čim nema posla u redu, a
 *    klijent ga prosto otvori ponovo kad prijavi sledeći korak. Puca li se na
 *    njega izuzetkom, drugi korak nikad ne prođe.
 * 4. Odgovor se u toku deli praznim redom (`\n\n`), a ishod se prepoznaje po
 *    `event_id` — inače jedan korak može pokupiti tuđi ishod.
 */
class Session {
  readonly hash = crypto.randomUUID().replace(/-/g, '').slice(0, 11);
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private buf = '';
  private readonly dec = new TextDecoder();

  private async open() {
    if (this.reader) return;
    const res = await fetch(`${SPACE}/gradio_api/queue/data?session_hash=${this.hash}`, {
      headers: { ...auth(), Accept: 'text/event-stream' },
    });
    if (!res.ok || !res.body) throw new Error(`tok ${res.status}`);
    this.reader = res.body.getReader();
    this.buf = '';
  }

  private drop() {
    this.reader?.cancel().catch(() => {});
    this.reader = undefined;
    this.buf = '';
  }

  close() {
    this.drop();
  }

  /**
   * Prijavi korak i sačekaj baš njegov ishod.
   *
   * `wantOutput` postoji zbog `image_to_3d`: uz rezultat vraća i video pregled
   * zapakovan u sam odgovor — desetine megabajta koje funkciji sruše memoriju.
   * Taj korak ostavlja ono što nam treba u sesiji, pa mu se odgovor ne čuva.
   */
  async run(step: keyof typeof FN, data: unknown[], wantOutput = true): Promise<unknown[]> {
    const join = await fetch(`${SPACE}/gradio_api/queue/join`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        event_data: null,
        fn_index: FN[step],
        trigger_id: null,
        session_hash: this.hash,
      }),
    });
    const joined = await join.text();
    if (!join.ok) throw new Error(`${step} prijava ${join.status}: ${joined.slice(0, 200)}`);
    const mine = JSON.parse(joined)?.event_id ?? null;

    // Sesija sada postoji, pa tok sme da se otvori.
    await this.open();

    if (!wantOutput) return this.skim(step);

    let reopened = 0;
    while (true) {
      const frame = await this.frame();

      if (frame === null) {
        // Tok se zatvorio: otvori ga ponovo i nastavi da čekaš svoj ishod.
        // Više od nekoliko puta znači da se posao izgubio.
        if (++reopened > 40) throw new Error(`${step}: tok se prekida bez ishoda`);
        this.drop();
        await this.open();
        continue;
      }
      if (!frame.startsWith('data:')) continue;
      const payload = frame.slice(5).trim();

      if (payload.includes('"close_stream"')) {
        this.drop();
        continue;
      }
      if (payload.includes('"heartbeat"') || payload.includes('"estimation"')) continue;

      let msg: any;
      try {
        msg = JSON.parse(payload);
      } catch {
        continue;
      }
      if (msg?.msg === 'unexpected_error') {
        throw new Error(`${step}: ${String(msg.message ?? '').slice(0, 240)}`);
      }
      if (msg?.msg !== 'process_completed') continue;
      if (mine && msg.event_id && msg.event_id !== mine) continue;
      if (msg.success === false) {
        const why = msg.output?.error ?? JSON.stringify(msg.output ?? msg).slice(0, 220);
        throw new Error(`${step}: ${String(why).slice(0, 260)}`);
      }
      return (msg.output?.data ?? []) as unknown[];
    }
  }

  /**
   * Čeka ishod ne pamteći odgovor.
   *
   * `image_to_3d` uz rezultat vraća i video pregled zapakovan u sam odgovor —
   * desetine megabajta. Ako se taj zapis sastavi pre nego što se pogleda,
   * funkciji nestane memorije (WORKER_RESOURCE_LIMIT) baš kad je posao već
   * bio gotov. Zato se tok ovde samo prelistava kroz mali pokretni prozor:
   * traži se reč da je posao završen, a sadržaj se baca u hodu.
   */
  private async skim(step: string): Promise<unknown[]> {
    let win = '';
    let reopened = 0;
    while (true) {
      if (!this.reader) {
        if (++reopened > 40) throw new Error(`${step}: tok se prekida bez ishoda`);
        await this.open();
      }
      const { done, value } = await this.reader!.read();
      if (done) {
        this.drop();
        continue;
      }
      win = (win + this.dec.decode(value, { stream: true })).slice(-3000);
      if (win.includes('"close_stream"')) {
        this.drop();
        win = '';
        continue;
      }
      if (win.includes('"unexpected_error"')) throw new Error(`${step}: ${win.slice(-240)}`);
      if (win.includes('"process_completed"')) {
        if (win.includes('"success": false') || win.includes('"success":false')) {
          throw new Error(`${step}: posao nije uspeo`);
        }
        // Ostatak ogromnog zapisa se ne čita — tok se odbacuje, a sledeći
        // korak ga otvara iznova.
        this.drop();
        return [];
      }
    }
  }

  /** Jedan zapis sa toka; `null` znači da je tok zatvoren. */
  private async frame(): Promise<string | null> {
    while (true) {
      const cut = this.buf.indexOf('\n\n');
      if (cut >= 0) {
        const frame = this.buf.slice(0, cut).trim();
        this.buf = this.buf.slice(cut + 2);
        if (frame) return frame;
        continue;
      }
      if (!this.reader) return null;
      const { done, value } = await this.reader.read();
      if (done) {
        // Poslednji zapis ume da stigne bez praznog reda na kraju.
        const rest = this.buf.trim();
        this.buf = '';
        return rest || null;
      }
      this.buf += this.dec.decode(value, { stream: true });
    }
  }
}

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
  const form = new FormData();
  form.append('files', await img.blob(), 'product.jpg');

  const up = await fetch(`${SPACE}/gradio_api/upload`, { method: 'POST', headers: auth(), body: form });
  const text = await up.text();
  if (!up.ok) throw new Error(`otpremanje ${up.status}: ${text.slice(0, 200)}`);
  const path = JSON.parse(text)?.[0];
  if (!path) throw new Error(`otpremanje bez putanje: ${text.slice(0, 160)}`);
  return { path, url: null, orig_name: 'product.jpg', mime_type: 'image/jpeg',
           meta: { _type: 'gradio.FileData' } };
}

/** Fotografija → pripremljena slika → 3D → GLB. */
async function build(imageUrl: string, resolution: string) {
  const file = await upload(imageUrl);
  const s = new Session();
  try {
    await s.run('start_session', [], false);
    const pre = await s.run('preprocess_image', [file]);
    const cleaned = pre?.[0] as { url?: string; path?: string } | undefined;
    if (!cleaned?.url && !cleaned?.path) throw new Error('priprema slike nije vratila sliku');

    // Petnaest brojeva iza slike su tri grupe podešavanja koje Space traži
    // (oblik, materijal, doterivanje) — vrednosti su njegove podrazumevane.
    // Menja se samo rezolucija: 512 je dovoljno za telefon, veće traje
    // minutima na deljenoj kartici.
    await s.run(
      'image_to_3d',
      [cleaned, 0, resolution, 7.5, 0.7, 12, 5, 7.5, 0.5, 12, 3, 1, 0, 12, 3],
      false,
    );

    // Prvo polje je sesijsko stanje koje Space sam popunjava.
    const out = await s.run('extract_glb', [null, 100000, 1024]);
    const glb = out?.[0] as { url?: string } | undefined;
    if (!glb?.url) throw new Error('izvlačenje GLB-a nije vratilo fajl');
    return glb.url;
  } finally {
    s.close();
  }
}

/** GLB se seli na naš prostor: tuđi privremeni link nestaje za koji sat. */
async function store(url: string, name: string) {
  const res = await fetch(url, { headers: auth() });
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
  if (!r.ok && r.status !== 409 && r.status !== 400) {
    throw new Error(`kanta ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
}

/* --------------------------------------------------------------- knjigovodstvo */

const sql = () => postgres(DB, { prepare: false });

async function ensureColumns(s: ReturnType<typeof sql>) {
  await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_url text`;
  await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_state text`;
  await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_at timestamptz`;
}

/**
 * Uzima jedan proizvod i odmah ga obeležava kao „u radu".
 *
 * Obeležavanje ide u istoj naredbi kao izbor, pa dva istovremena poziva ne
 * mogu uzeti isti proizvod. Posao koji predugo stoji u radu je pao usput i
 * sme ponovo — inače bi jedan prekid zauvek zaglavio proizvod.
 */
async function claim(s: ReturnType<typeof sql>, slug: string | null) {
  const rows = await s`
    UPDATE sm_products SET model_state = 'working', model_at = now()
    WHERE id = (
      SELECT p.id FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
      WHERE p.active AND p.image_url IS NOT NULL AND p.model_url IS NULL
        AND (p.model_state IS NULL OR p.model_state = ''
             OR (p.model_state = 'working'
                 AND p.model_at < now() - ${STALE_MINUTES + ' minutes'}::interval))
        AND (${slug}::text IS NULL OR t.slug = ${slug})
      ORDER BY p.popularity DESC NULLS LAST, p.id
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, title, image_url, tags, materials,
      (SELECT slug FROM sm_tenants WHERE id = tenant_id) AS slug,
      (SELECT vertical FROM sm_tenants WHERE id = tenant_id) AS vertical`;
  return rows[0] ?? null;
}

/**
 * Radi dok ima posla i dok ima vremena.
 *
 * Funkcija ima svoj zid u sekundama; kad se približi, staje sama. Ono što
 * nije stiglo ostaje neobeleženo i sledeći poziv ga uzima — pa nema
 * izgubljenog posla ni kad se prekine na pola.
 */
async function work(slug: string | null, resolution: string, budgetMs: number, max: number) {
  const started = Date.now();
  const s = sql();
  const done: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  try {
    await ensureColumns(s);
    await ensureBucket();
    for (let i = 0; i < max; i++) {
      if (Date.now() - started > budgetMs) break;
      const p = await claim(s, slug);
      if (!p) break;

      if (!wantsModel(p)) {
        await s`UPDATE sm_products SET model_state = 'skip' WHERE id = ${p.id}`;
        skipped.push(p.title);
        continue;
      }
      try {
        const glb = await build(p.image_url, resolution);
        const saved = await store(glb, `${p.slug}/${p.id}.glb`);
        await s`UPDATE sm_products SET model_url = ${saved.url}, model_state = 'ready',
                model_at = now() WHERE id = ${p.id}`;
        done.push(`${p.title} (${Math.round(saved.bytes / 1024)} kB)`);
      } catch (e) {
        const why = String(e).slice(0, 200);
        // Potrošene sekunde na deljenoj kartici nisu greška proizvoda nego
        // stanje naloga, i vraćaju se svaki dan. Takav posao ostaje
        // neobeležen da bi ga sledeći put neko pokupio, i dalje se ne ide —
        // svaki sledeći pokušaj bi ionako naleteo na isti zid.
        const outOfGpu = /quota|exceeded|GPU/i.test(why);
        await s`UPDATE sm_products SET model_state = ${outOfGpu ? null : why},
                model_at = now() WHERE id = ${p.id}`;
        failed.push(`${p.title}: ${why}`);
        if (outOfGpu) break;
      }
    }
  } finally {
    await s.end({ timeout: 5 });
  }
  return { done, skipped, failed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* prazno telo pada ispod */ }

  if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);
  const action = String(body.action ?? 'status');

  if (action === 'health') {
    return json({ ok: !!(DB && SUPA && SERVICE), token: !!HF, space: SPACE });
  }

  // Koliko je gotovo, koliko čeka, šta je palo — ovo gleda konzola.
  if (action === 'status') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    const s = sql();
    try {
      await ensureColumns(s);
      const slug = body.slug ? String(body.slug) : null;
      const [row] = await s`
        SELECT
          count(*) FILTER (WHERE p.model_url IS NOT NULL)::int AS ready,
          count(*) FILTER (WHERE p.model_state = 'skip')::int AS skipped,
          count(*) FILTER (WHERE p.model_state = 'working')::int AS working,
          count(*) FILTER (WHERE p.model_url IS NULL AND p.model_state IS NOT NULL
                             AND p.model_state NOT IN ('skip', 'working'))::int AS failed,
          count(*) FILTER (WHERE p.model_url IS NULL
                             AND (p.model_state IS NULL OR p.model_state = ''))::int AS waiting
        FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
        WHERE p.active AND (${slug}::text IS NULL OR t.slug = ${slug})`;
      return json(row);
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  // Pokreni obradu. Odgovor stiže odmah; posao se nastavlja u pozadini, pa
  // konzola ne visi i nema veze koja se prekida na pola.
  if (action === 'run') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    if (!HF) return json({ error: 'HF_TOKEN nije podešen' }, 500);
    const slug = body.slug ? String(body.slug) : null;
    const resolution = ['512', '1024'].includes(String(body.resolution)) ? String(body.resolution) : '512';
    const max = Math.max(1, Math.min(20, Number(body.max) || 4));

    // Ostavlja se rezerva do zida funkcije, da poslednji upis u bazu stigne.
    const job = work(slug, resolution, 110000, max);

    if (body.wait) return json(await job);
    (globalThis as any).EdgeRuntime?.waitUntil?.(job.catch(() => {}));
    return json({ started: true, slug, resolution, max });
  }

  // Ponovo pokušaj ono što je palo — bez ovoga bi greška bila doživotna.
  // Briše se i „u radu": posao koji je srušio funkciju ostaje tako zapisan,
  // a čekati dvadeset minuta na svaki pokušaj nema smisla.
  if (action === 'retry') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    const s = sql();
    try {
      await ensureColumns(s);
      const slug = body.slug ? String(body.slug) : null;
      const rows = await s`
        UPDATE sm_products SET model_state = NULL WHERE id IN (
          SELECT p.id FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
          WHERE p.model_url IS NULL AND p.model_state IS NOT NULL
            AND p.model_state <> 'skip'
            AND (${slug}::text IS NULL OR t.slug = ${slug}))
        RETURNING id`;
      return json({ reset: rows.length });
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  return json({ error: 'nepoznata radnja' }, 400);
});
