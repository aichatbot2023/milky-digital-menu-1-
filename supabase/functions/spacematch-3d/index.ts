// Proizvod sa fotografije u 3D model.
//
// Klijentov katalog su ravne slike. Tepih, lampa i fotelja se na zidu ne mogu
// prikazati kao nalepnica — kupac mora da ih vidi kao predmet u svom prostoru,
// iz svog ugla. Zato fotografija takvog proizvoda ide na pretvaranje u 3D i
// dobija svoj GLB.
//
// Izvor nije jedan nego lanac, isto kao kod jezičkih modela: TRELLIS.2 daje
// najbolji oblik, Hunyuan3D i TripoSG su jednostavniji i otporniji — jedan
// jedini poziv, bez sesije. Prvi koji odgovori dobija posao. Tako pad ili
// gužva na jednom mestu ne zaustavlja ceo katalog.
//
// NA KRAJU LANCA STOJI NAŠ SOPSTVENI IZVOR i on ne može da otkaže.
//
// Sva tri tuđa izvora rade na deljenoj grafičkoj kartici (`zero-a10g`), a
// sekunde na njoj se mere po nalogu I po adresi sa koje se dolazi. Izmereno,
// oba puta: sa tokenom „60s requested vs. 0s left", bez tokena ista rečenica.
// Znači ni bolji token ni drugi Space ne pomažu — sa servera se tamo prosto
// ne može računati. Zato je gotov model ovde stvar naše kuće, a tuđa kartica
// samo dobrodošao višak kad je bude.
//
// Naš izvor ne pogađa oblik neuronskom mrežom — on ga izvodi iz same slike:
// predmet se izreže sa podloge, iz njegovog obrisa se izračuna koliko je koja
// tačka duboko unutar tela, i to postaje ispupčenje. Fotografija ostaje kao
// površina. Predmet time dobija zapreminu, senku i pravu razmeru u prostoru,
// a kupac ga vidi iz svog ugla. Traje desetinku sekunde, ne 60, i nema kvotu.
//
// Posao se NE radi dok kupac čeka. Radi se jednom, model se čuva kod nas, a
// kupcu posle stiže gotov fajl.
//
// Sve se odvija unutar Supabase-a: ne treba ni GitHub tajna, ni ručno
// pokretanje, ni bilo šta sa strane. Odgovor se vraća odmah, a posao se
// nastavlja u pozadini (`EdgeRuntime.waitUntil`); stanje svakog proizvoda
// stoji u bazi, pa ako se izvršavanje prekine na pola, sledeći poziv
// nastavlja gde je stalo.

import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

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

const TRELLIS = 'https://microsoft-trellis-2.hf.space';
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
  /**
   * Adresa Space-a i put do njegovog API-ja.
   *
   * Gradio 5 sve stavlja pod `/gradio_api/`, gradio 4 nema taj prefiks. Isti
   * poziv na pogrešnom putu vrati „Not Found", pa se prefiks nosi uz izvor.
   */
  constructor(private readonly base: string, private readonly api = '/gradio_api') {}
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private buf = '';
  private readonly dec = new TextDecoder();

  private async open() {
    if (this.reader) return;
    const res = await fetch(`${this.base}${this.api}/queue/data?session_hash=${this.hash}`, {
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
  async run(
    step: { index: number; name: string },
    data: unknown[],
    wantOutput = true,
    ms = 300000,
  ): Promise<unknown[]> {
    const join = await fetch(`${this.base}${this.api}/queue/join`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        event_data: null,
        fn_index: step.index,
        trigger_id: null,
        session_hash: this.hash,
      }),
    });
    const joined = await join.text();
    if (!join.ok) throw new Error(`${step.name} prijava ${join.status}: ${joined.slice(0, 200)}`);
    const mine = JSON.parse(joined)?.event_id ?? null;

    // Sesija sada postoji, pa tok sme da se otvori.
    await this.open();

    if (!wantOutput) return this.skim(step.name, ms);

    let reopened = 0;
    while (true) {
      const frame = await this.frame();

      if (frame === null) {
        // Tok se zatvorio: otvori ga ponovo i nastavi da čekaš svoj ishod.
        // Više od nekoliko puta znači da se posao izgubio.
        if (++reopened > 40) throw new Error(`${step.name}: tok se prekida bez ishoda`);
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
        throw new Error(`${step.name}: ${String(msg.message ?? '').slice(0, 240)}`);
      }
      if (msg?.msg !== 'process_completed') continue;
      if (mine && msg.event_id && msg.event_id !== mine) continue;
      if (msg.success === false) {
        const why = msg.output?.error ?? JSON.stringify(msg.output ?? msg).slice(0, 220);
        throw new Error(`${step.name}: ${String(why).slice(0, 260)}`);
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
  private async skim(step: string, ms: number): Promise<unknown[]> {
    const until = Date.now() + ms;
    let win = '';
    let reopened = 0;
    while (true) {
      if (!this.reader) {
        if (++reopened > 40) throw new Error(`${step}: tok se prekida bez ishoda`);
        await this.open();
      }
      if (Date.now() > until) throw new Error(`${step}: isteklo vreme`);
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
async function upload(base: string, imageUrl: string, api = '/gradio_api') {
  const img = await fetch(imageUrl);
  if (!img.ok) throw new Error(`slika proizvoda ${img.status}`);
  const form = new FormData();
  form.append('files', await img.blob(), 'product.jpg');

  const up = await fetch(`${base}${api}/upload`, { method: 'POST', headers: auth(), body: form });
  const text = await up.text();
  if (!up.ok) throw new Error(`otpremanje ${up.status}: ${text.slice(0, 200)}`);
  const path = JSON.parse(text)?.[0];
  if (!path) throw new Error(`otpremanje bez putanje: ${text.slice(0, 160)}`);
  return { path, url: null, orig_name: 'product.jpg', mime_type: 'image/jpeg',
           meta: { _type: 'gradio.FileData' } };
}

/**
 * Jedan poziv jednom Space-u koji radi u jednom koraku.
 *
 * TripoSG i Hunyuan3D nemaju sesijsko stanje: slika ulazi, model izlazi.
 * Zato im ne treba ništa od one mašinerije koju TRELLIS traži — samo prijava
 * posla i čekanje ishoda na istom toku.
 */
async function oneShot(base: string, fnIndex: number, data: unknown[], ms: number, api = '/gradio_api') {
  const s = new Session(base, api);
  try {
    const out = await s.run({ index: fnIndex, name: 'image_to_3d' }, data, true, ms);
    // Prvi fajl u odgovoru je model; neki Space-ovi vrate i sličicu uz njega.
    for (const item of out) {
      const url = (item as { url?: string })?.url;
      if (url && /\.(glb|obj|ply)(\?|$)/i.test(url)) return url;
    }
    const first = (out?.[0] as { url?: string })?.url;
    if (first) return first;
    throw new Error('odgovor bez modela');
  } finally {
    s.close();
  }
}

/** Fotografija → 3D preko TRELLIS-a: četiri koraka i sesija između njih. */
async function viaTrellis(imageUrl: string, resolution: string) {
  const file = await upload(TRELLIS, imageUrl);
  const s = new Session(TRELLIS);
  try {
    await s.run({ index: FN.start_session, name: 'start_session' }, [], false, 30000);
    const pre = await s.run({ index: FN.preprocess_image, name: 'preprocess_image' }, [file], true, 120000);
    const cleaned = pre?.[0] as { url?: string; path?: string } | undefined;
    if (!cleaned?.url && !cleaned?.path) throw new Error('priprema slike nije vratila sliku');

    // Petnaest brojeva iza slike su tri grupe podešavanja koje Space traži
    // (oblik, materijal, doterivanje) — vrednosti su njegove podrazumevane.
    await s.run(
      { index: FN.image_to_3d, name: 'image_to_3d' },
      [cleaned, 0, resolution, 7.5, 0.7, 12, 5, 7.5, 0.5, 12, 3, 1, 0, 12, 3],
      false,
      300000,
    );
    const out = await s.run({ index: FN.extract_glb, name: 'extract_glb' }, [null, 100000, 1024], true, 180000);
    const glb = out?.[0] as { url?: string } | undefined;
    if (!glb?.url) throw new Error('izvlačenje GLB-a nije vratilo fajl');
    return glb.url;
  } finally {
    s.close();
  }
}

/* --------------------------------------------------- sopstveni izvor, bez kvote */

/** Duža strana površine koja ide u model. Preko ovoga raste fajl, ne lepota. */
const TEX = 640;
/** Najviše ovoliko tačaka mreže po strani. */
const GRID = 96;

/**
 * Koliko je predmet pun, po delatnosti studija.
 *
 * Debljina svakog dela izvodi se iz njegove sopstvene širine: noga lampe je
 * tanka pa ostaje šipka, abažur je širok pa postaje kupola. Jedno pravilo za
 * ceo predmet ne valja — prva verzija je uzimala jednu debljinu za sve i noga
 * je ispala devet puta deblja nego što je široka, pa se iz profila videla kao
 * dve šipke umesto jedne.
 *
 * Iz obrisa se ipak ne vidi da li je nešto okruglo ili ravno — tepih i vaza
 * imaju isti obris. To zna delatnost, pa ona daje množilac.
 */
const PLUMP: Record<string, number> = {
  lighting: 1.25,
  furniture: 1.1,
  interior: 1.15,
  kitchen: 1.15,
  flooring: 0.12,  // tepisi i pločice su ravni, ma koliko široki bili
  art: 0.07,
  realestate: 0.8,
};

/** Ni najokruglije nije dublje od pola svoje širine. */
const MAX_DEPTH = 0.5;

/**
 * Fotografija sa koje se predmet ne da pouzdano izrezati.
 *
 * Nije greška nego osobina slike, pa se i beleži drugačije: proizvod se ne
 * pokušava ponovo dok se slika ne promeni.
 */
const NOCUT = 'rez nije pouzdan';

/** Isti pragovi kao pri izrezivanju u pregledaču — mereni na istim slikama. */
const CUT = { step: 26, minEdge: 0.6, minOff: 0.04, maxOff: 0.97 };

/**
 * Koliko podloga sme da odluta od boje oboda, od najpopustljivijeg naniže.
 *
 * Jedna vrednost ne pokriva sve. Lampa sa kremastim abažurom na kremastom
 * zidu — a to je pola kataloga rasvete — pri 190 propusti izlivanje kroz sam
 * abažur: predmet se raspadne na komade koji posle lebde jedan pored drugog.
 * Zato se ne bira unapred nego se proba redom i uzima prva vrednost čiji rez
 * da predmet u JEDNOM komadu. Popustljivije je bolje kad prolazi, jer manje
 * podloge ostane zalepljeno uz predmet.
 */
const DRIFTS = [190, 140, 100, 70, 45];

/**
 * Ispod ovoliko u najvećem komadu rez se ne smatra ispravnim.
 *
 * Izmereno na oba slučaja: kod prave kataloške fotografije najveći komad nosi
 * 0.94–1.00 već pri najpopustljivijem odstupanju. Kod fotografije predmeta U
 * PROSTORU — lampa na stolu ispred zida — nijedno odstupanje ne dâ i ceo
 * komad i podlogu uz sve četiri ivice: ili se predmet raspadne (0.77), ili
 * ostane pola zida i stola zalepljeno uz njega (ivica padne na 0.00).
 * Takva slika ne dobija model. Nikakav model je bolji od pogrešnog.
 */
const WHOLE = 0.92;

const diff = (a: Uint8ClampedArray, i: number, r: number, g: number, b: number) =>
  Math.abs(a[i] - r) + Math.abs(a[i + 1] - g) + Math.abs(a[i + 2] - b);

/**
 * Povezani komadi predmeta.
 *
 * Vraća masku samo najvećeg komada i koliki je njegov udeo. Udeo je merilo
 * ispravnosti reza: ceo predmet je jedan komad, a rez koji je procurio kroz
 * predmet ostavlja dva-tri odvojena parčeta i udeo padne.
 */
function biggest(solid: Uint8Array, w: number, h: number) {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const sizes: number[] = [];
  let total = 0;
  for (let start = 0; start < n; start++) {
    if (!solid[start] || label[start] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    label[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const near = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of near) {
        if (q < 0 || q >= n || !solid[q] || label[q] >= 0) continue;
        label[q] = id;
        queue[tail++] = q;
      }
    }
    sizes.push(tail);
    total += tail;
  }
  if (!sizes.length) return { solid, share: 0 };
  let win = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[win]) win = i;
  const one = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (label[p] === win) one[p] = 1;
  return { solid: one, share: sizes[win] / total };
}

/**
 * Predmet odvojen od podloge.
 *
 * Isti postupak koji radi u pregledaču: izlivanje kreće od ivica slike i teče
 * kroz preliv, a staje na skoku — na ivici predmeta. Bez modela i bez kvote.
 *
 * Razlika je što se ovde rez i PROVERAVA. U pregledaču loš rez znači ružnu
 * sliku; ovde znači model koji se raspao na komade, pa se rez ponavlja sa sve
 * strožim odstupanjem dok predmet ne ostane u jednom komadu.
 *
 * Vraća `solid` (1 = predmet) i `ok`. Kad nijedan rez ne prođe — fotografija
 * u ambijentu, predmet iste boje kao zid — `ok` je netačno i proizvod ostaje
 * bez modela. Relief od takve slike uvukao bi zid i sto u sam predmet.
 */
function separate(px: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  const all = () => ({ solid: new Uint8Array(n).fill(1), ok: false });

  // Obod se obilazi u krug, da susedni par nikad ne bude sa suprotnih strana.
  const ring: number[] = [];
  for (let x = 0; x < w; x++) ring.push(x);
  for (let y = 1; y < h; y++) ring.push(y * w + w - 1);
  for (let x = w - 2; x >= 0; x--) ring.push((h - 1) * w + x);
  for (let y = h - 2; y > 0; y--) ring.push(y * w);

  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (const p of ring) { rs.push(px[p * 4]); gs.push(px[p * 4 + 1]); bs.push(px[p * 4 + 2]); }
  const mid = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const [br, bg, bb] = [mid(rs), mid(gs), mid(bs)];

  let jumps = 0;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1] * 4;
    if (diff(px, ring[i] * 4, px[a], px[a + 1], px[a + 2]) > CUT.step * 2) jumps++;
  }
  if (jumps / ring.length >= 0.09) return all();

  const off = new Uint8Array(n);
  const queue = new Int32Array(n);

  /** Jedno izlivanje sa zadatim odstupanjem; `null` kad rez očigledno ne valja. */
  const flood = (drift: number) => {
    off.fill(0);
    let head = 0, tail = 0;
    const push = (p: number, from: number) => {
      if (p < 0 || p >= n || off[p]) return;
      const i = p * 4;
      if (from >= 0) {
        const j = from * 4;
        if (diff(px, i, px[j], px[j + 1], px[j + 2]) > CUT.step) return;
      }
      if (diff(px, i, br, bg, bb) > drift) return;
      off[p] = 1;
      queue[tail++] = p;
    };
    for (let x = 0; x < w; x++) { push(x, -1); push((h - 1) * w + x, -1); }
    for (let y = 0; y < h; y++) { push(y * w, -1); push(y * w + w - 1, -1); }
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      if (x > 0) push(p - 1, p);
      if (x < w - 1) push(p + 1, p);
      push(p - w, p);
      push(p + w, p);
    }

    const share = tail / n;
    if (share < CUT.minOff || share > CUT.maxOff) return null;

    // Podloga mora da okružuje predmet sa sve četiri strane.
    const side = (from: number, step: number, count: number) => {
      let hit = 0;
      for (let i = 0; i < count; i++) if (off[from + i * step]) hit++;
      return hit / count;
    };
    const weakest = Math.min(
      side(0, 1, w), side((h - 1) * w, 1, w), side(0, w, h), side(w - 1, w, h),
    );
    if (weakest < CUT.minEdge) return null;

    const solid = new Uint8Array(n);
    for (let p = 0; p < n; p++) solid[p] = off[p] ? 0 : 1;
    return biggest(solid, w, h);
  };

  for (const drift of DRIFTS) {
    const got = flood(drift);
    if (got && got.share >= WHOLE) return { solid: got.solid, ok: true };
  }
  return all();
}

/**
 * Koliko je koja tačka duboko unutar predmeta.
 *
 * Dva prolaza preko slike, napred i nazad — svaka tačka uzme najmanje
 * rastojanje od svojih već obrađenih suseda uvećano za korak. Dijagonalni
 * sused nosi 1.41, uspravni 1. Tako se u dva prolaza dobije rastojanje do
 * obrisa, iz kojeg posle nastaje ispupčenje.
 */
function inward(solid: Uint8Array, w: number, h: number) {
  const BIG = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = solid[i] ? BIG : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!solid[p]) continue;
      d[p] = Math.min(d[p], at(x - 1, y) + 1, at(x, y - 1) + 1,
                      at(x - 1, y - 1) + 1.41421, at(x + 1, y - 1) + 1.41421);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (!solid[p]) continue;
      d[p] = Math.min(d[p], at(x + 1, y) + 1, at(x, y + 1) + 1,
                      at(x + 1, y + 1) + 1.41421, at(x - 1, y + 1) + 1.41421);
    }
  }
  return d;
}

/**
 * Zaobljavanje grebena.
 *
 * Debljina koja prati rastojanje do obrisa pravi oštar greben po sredini
 * predmeta — kao krov, ne kao telo. Zamućenje sa širinom srazmernom predmetu
 * pretvara taj krov u kupolu. Van predmeta je nula i ostaje nula, pa se lice
 * i naličje i dalje sastaju tačno na obrisu.
 *
 * Zbir po redovima, pa po kolonama — cena je ista bez obzira na širinu
 * zamućenja, pa veliki predmet ne košta više od malog.
 */
function soften(v: Float32Array, w: number, h: number, radius: number, times = 2) {
  const r = Math.max(1, Math.round(radius));
  const sum = new Float32Array(Math.max(w, h) + 1);
  const span = (i: number, n: number) => {
    const a = Math.max(0, i - r), b = Math.min(n - 1, i + r);
    return (sum[b + 1] - sum[a]) / (b - a + 1);
  };
  for (let t = 0; t < times; t++) {
    for (let y = 0; y < h; y++) {
      sum[0] = 0;
      for (let x = 0; x < w; x++) sum[x + 1] = sum[x] + v[y * w + x];
      for (let x = 0; x < w; x++) v[y * w + x] = span(x, w);
    }
    for (let x = 0; x < w; x++) {
      sum[0] = 0;
      for (let y = 0; y < h; y++) sum[y + 1] = sum[y] + v[y * w + x];
      for (let y = 0; y < h; y++) v[y * w + x] = span(y, h);
    }
  }
}

/* ------------------------------------------------------------- pisanje GLB-a */

const align4 = (n: number) => (n + 3) & ~3;

/**
 * GLB je jedan fajl sa dva dela: opis u JSON-u i sirovi brojevi uz njega.
 *
 * Piše se ručno, bez biblioteke — format je mali, a svaka biblioteka bi bila
 * novo preuzimanje koje ume da otkaže. Slika ide U isti fajl, pa model nema
 * nijednu vezu ka spolja i radi i kad je mreža loša.
 */
function glb(mesh: {
  pos: Float32Array; nrm: Float32Array; uv: Float32Array; idx: Uint32Array;
  min: number[]; max: number[]; png: Uint8Array; name: string;
}) {
  const parts = [
    new Uint8Array(mesh.pos.buffer, mesh.pos.byteOffset, mesh.pos.byteLength),
    new Uint8Array(mesh.nrm.buffer, mesh.nrm.byteOffset, mesh.nrm.byteLength),
    new Uint8Array(mesh.uv.buffer, mesh.uv.byteOffset, mesh.uv.byteLength),
    new Uint8Array(mesh.idx.buffer, mesh.idx.byteOffset, mesh.idx.byteLength),
    mesh.png,
  ];
  // `buffer: 0` nije ukras: bez njega učitavač traži nepostojeći izvor i
  // model pukne već na prvom pristupu.
  const views: { buffer: number; byteOffset: number; byteLength: number; target?: number }[] = [];
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: parts[i].byteLength,
      ...(i < 3 ? { target: 34962 } : i === 3 ? { target: 34963 } : {}),
    });
    offset = align4(offset + parts[i].byteLength);
  }
  const bin = new Uint8Array(offset);
  for (let i = 0; i < parts.length; i++) bin.set(parts[i], views[i].byteOffset);

  const count = mesh.pos.length / 3;
  const doc = {
    asset: { version: '2.0', generator: 'SpaceMatch relief' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: mesh.name }],
    meshes: [{
      name: mesh.name,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      name: mesh.name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
      // Obris crta providnost same fotografije, ne mreža. Zato mreža sme da
      // bude za dlaku šira od predmeta — stepenice mreže se ne vide, a ivica
      // ostaje oštra kao na slici.
      alphaMode: 'MASK',
      alphaCutoff: 0.5,
      doubleSided: true,
    }],
    textures: [{ source: 0, sampler: 0 }],
    images: [{ bufferView: 4, mimeType: 'image/png' }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min: mesh.min, max: mesh.max },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: mesh.idx.length, type: 'SCALAR' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.byteLength }],
  };

  let json = new TextEncoder().encode(JSON.stringify(doc));
  const pad = align4(json.length) - json.length;
  if (pad) {
    const padded = new Uint8Array(json.length + pad).fill(0x20);
    padded.set(json);
    json = padded;
  }

  const total = 12 + 8 + json.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);   // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json.length, true);
  dv.setUint32(16, 0x4e4f534a, true);  // "JSON"
  out.set(json, 20);
  const binAt = 20 + json.length;
  dv.setUint32(binAt, bin.length, true);
  dv.setUint32(binAt + 4, 0x004e4942, true); // "BIN"
  out.set(bin, binAt + 8);
  return out;
}

/**
 * Fotografija proizvoda → GLB, ovde kod nas.
 *
 * Model je normalizovan: širina je tačno 1, visina prati odnos stranica,
 * središte je u koordinatnom početku. Prava veličina se dodaje pri
 * postavljanju u prostor, iz stvarnih centimetara proizvoda — isto kao što
 * SafeNest već računa razmeru rešenja na mestu opasnosti.
 */
async function relief(imageUrl: string, name: string, vertical = '') {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`slika proizvoda ${res.status}`);
  const img = await Image.decode(new Uint8Array(await res.arrayBuffer()));

  const scale = Math.min(1, TEX / Math.max(img.width, img.height));
  const src = scale < 1
    ? img.resize(Math.max(2, Math.round(img.width * scale)), Image.RESIZE_AUTO)
    : img;
  const w = src.width, h = src.height;
  const px = new Uint8ClampedArray(src.bitmap);

  const { solid, ok } = separate(px, w, h);
  if (!ok) throw new Error(NOCUT);

  // Okvir predmeta, sa malo vazduha okolo da ivica ne dodiruje rub slike.
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let p = 0; p < w * h; p++) {
    if (!solid[p]) continue;
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < x0 || y1 < y0) throw new Error('na slici nema predmeta');
  const air = 2;
  x0 = Math.max(0, x0 - air); y0 = Math.max(0, y0 - air);
  x1 = Math.min(w - 1, x1 + air); y1 = Math.min(h - 1, y1 + air);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

  // Isečena površina sa providnom podlogom — ona je i obris i boja modela.
  const cut = new Uint8Array(cw * ch * 4);
  const mask = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((y + y0) * w + (x + x0)), d = (y * cw + x);
      mask[d] = solid[s];
      cut[d * 4] = px[s * 4];
      cut[d * 4 + 1] = px[s * 4 + 1];
      cut[d * 4 + 2] = px[s * 4 + 2];
      cut[d * 4 + 3] = solid[s] ? px[s * 4 + 3] : 0;
    }
  }
  const skin = new Image(cw, ch);
  skin.bitmap.set(cut);
  const png = await skin.encode(3);

  // Obris → dubina. Svaka tačka je duboko onoliko koliko je daleko od ivice
  // predmeta: uska noga ostaje uska, širok abažur postaje kupola. Množilac
  // delatnosti kaže da li je predmet uopšte pun ili ravan.
  const dist = inward(mask, cw, ch);
  const unit = 1 / cw;                        // koliko sveta stane u jedan piksel
  const plump = PLUMP[vertical] ?? 1.1;
  const height = new Float32Array(cw * ch);
  for (let i = 0; i < height.length; i++) {
    if (!mask[i]) continue;
    height[i] = Math.min(MAX_DEPTH, dist[i] * unit * plump);
  }
  // Zamućenje samo toliko da greben po sredini postane kupola. Šire od ovoga
  // ne zaobljava nego spljošti — prva mera je lampi pojela dve petine dubine.
  soften(height, cw, ch, Math.max(2, 0.02 * Math.min(cw, ch)), 3);

  // Mreža preko isečka. Tačka je „puna" ako je bar jedan piksel u njenoj
  // ćeliji pun — mreža time izađe za pola ćelije šira od predmeta, a
  // providnost fotografije to opet zaseče na tačan obris.
  const cell = Math.max(1, Math.ceil(Math.max(cw, ch) / GRID));
  const gw = Math.floor(cw / cell) + 1, gh = Math.floor(ch / cell) + 1;
  const gx = (i: number) => Math.min(cw - 1, i * cell);
  const gy = (j: number) => Math.min(ch - 1, j * cell);

  const full = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const cx = gx(i), cy = gy(j);
      let hit = 0;
      for (let dy = -cell; dy <= cell && !hit; dy++) {
        for (let dx = -cell; dx <= cell && !hit; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < cw && y < ch && mask[y * cw + x]) hit = 1;
        }
      }
      full[j * gw + i] = hit;
    }
  }

  // Ćelija ulazi u model kad su joj sva četiri ugla puna.
  const used = new Uint8Array(gw * gh);
  const cells: number[] = [];
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const a = j * gw + i, b = a + 1, c = a + gw, d = c + 1;
      if (!(full[a] && full[b] && full[c] && full[d])) continue;
      cells.push(a);
      used[a] = used[b] = used[c] = used[d] = 1;
    }
  }
  if (!cells.length) throw new Error('predmet je premali za mrežu');

  const index = new Int32Array(gw * gh).fill(-1);
  let count = 0;
  for (let p = 0; p < used.length; p++) if (used[p]) index[p] = count++;

  const pos = new Float32Array(count * 2 * 3);
  const nrm = new Float32Array(count * 2 * 3);
  const uv = new Float32Array(count * 2 * 2);
  const at = (x: number, y: number) =>
    height[Math.min(ch - 1, Math.max(0, y)) * cw + Math.min(cw - 1, Math.max(0, x))];

  const cxWorld = 0.5, cyWorld = (ch / cw) / 2;
  let minZ = 0, maxZ = 0;
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const g = j * gw + i;
      if (index[g] < 0) continue;
      const x = gx(i), y = gy(j);
      const z = at(x, y);
      // Nagib visine daje normalu; svetlo onda pada kao na pravom telu.
      const hx = (at(x + cell, y) - at(x - cell, y)) / (2 * cell * unit);
      const hy = (at(x, y - cell) - at(x, y + cell)) / (2 * cell * unit);
      const len = Math.hypot(hx, hy, 1);

      const X = x * unit - cxWorld;
      const Y = cyWorld - y * unit;
      const u = x / (cw - 1), v = y / (ch - 1);

      const f = index[g], bk = count + index[g];
      pos[f * 3] = X; pos[f * 3 + 1] = Y; pos[f * 3 + 2] = z;
      pos[bk * 3] = X; pos[bk * 3 + 1] = Y; pos[bk * 3 + 2] = -z;
      nrm[f * 3] = -hx / len; nrm[f * 3 + 1] = -hy / len; nrm[f * 3 + 2] = 1 / len;
      nrm[bk * 3] = -hx / len; nrm[bk * 3 + 1] = -hy / len; nrm[bk * 3 + 2] = -1 / len;
      uv[f * 2] = u; uv[f * 2 + 1] = v;
      uv[bk * 2] = u; uv[bk * 2 + 1] = v;
      if (z > maxZ) maxZ = z;
      if (-z < minZ) minZ = -z;
    }
  }

  const idx = new Uint32Array(cells.length * 12);
  let k = 0;
  for (const a of cells) {
    const b = a + 1, c = a + gw, d = c + 1;
    const A = index[a], B = index[b], C = index[c], D = index[d];
    // Lice: suprotno od kazaljke gledano spreda. Naličje: obrnuto.
    idx[k++] = A; idx[k++] = C; idx[k++] = D;
    idx[k++] = A; idx[k++] = D; idx[k++] = B;
    idx[k++] = count + A; idx[k++] = count + D; idx[k++] = count + C;
    idx[k++] = count + A; idx[k++] = count + B; idx[k++] = count + D;
  }

  const bytes = glb({
    pos, nrm, uv, idx,
    min: [-cxWorld, -cyWorld, minZ],
    max: [1 - cxWorld, cyWorld, maxZ],
    png, name,
  });
  return { bytes, cut: ok, tris: idx.length / 3 };
}

/**
 * Lanac izvora, po kvalitetu oblika.
 *
 * Prva tri su tuđa i rade na deljenoj kartici; poslednji je naš i nema kvotu.
 * Kad kartica ima sekundi, oblik je bolji; kad nema — a to je ovde pravilo,
 * ne izuzetak — katalog svejedno dobije svoje modele istog dana.
 */
const SOURCES: {
  name: string;
  run: (imageUrl: string, resolution: string) => Promise<string>;
}[] = [
  { name: 'trellis', run: viaTrellis },
  {
    name: 'hunyuan3d',
    run: async (imageUrl) => {
      const base = 'https://tencent-hunyuan3d-2.hf.space';
      // Ovaj Space je na gradiju 4 — bez `/gradio_api` prefiksa.
      const file = await upload(base, imageUrl, '');
      // Trinaest polja: opis, slika, četiri pogleda (koristimo samo glavni),
      // pa podešavanja. Vrednosti su podrazumevane sa samog Space-a.
      return oneShot(
        base, 8,
        ['', file, null, null, null, null, 30, 5, 1234, 256, true, 8000, true],
        300000, '',
      );
    },
  },
  {
    name: 'triposg',
    run: async (imageUrl) => {
      const base = 'https://vast-ai-triposg.hf.space';
      const file = await upload(base, imageUrl);
      // image, seed, broj koraka, jačina vođenja, ukloni pozadinu
      return oneShot(base, 4, [file, 42, 50, 7, true], 300000);
    },
  },
];

/**
 * Prazna kartica je prazna za ceo niz.
 *
 * Kad prvi proizvod naleti na potrošene sekunde, nema razloga da se na svakom
 * sledećem opet čeka minut da bi se čula ista rečenica. Pamti se na sat
 * vremena — dovoljno da niz prođe bez čekanja, a dovoljno kratko da se
 * povraćena kvota sama primeti.
 */
let gpuBlockedUntil = 0;
const GPU_REST_MS = 60 * 60 * 1000;

/** Fotografija → GLB, prvim izvorom koji odgovori. Poslednji uvek odgovori. */
async function build(imageUrl: string, resolution: string, name: string, vertical: string) {
  const tried: string[] = [];
  if (HF && Date.now() >= gpuBlockedUntil) {
    for (const src of SOURCES) {
      try {
        const url = await src.run(imageUrl, resolution);
        const got = await fetch(url, { headers: auth() });
        if (!got.ok) throw new Error(`preuzimanje GLB-a ${got.status}`);
        return { bytes: new Uint8Array(await got.arrayBuffer()), via: src.name, tried };
      } catch (e) {
        const why = String(e);
        tried.push(`${src.name}: ${why.slice(0, 120)}`);
        // Sve tri tuđe adrese dele istu karticu. Ako je jedna kaže da je
        // prazna, ostale dve nemaju šta drugo da kažu.
        if (/quota|0s left|GPU/i.test(why)) { gpuBlockedUntil = Date.now() + GPU_REST_MS; break; }
      }
    }
  }
  const made = await relief(imageUrl, name, vertical);
  return { bytes: made.bytes, via: 'relief', tried };
}

/** GLB se seli na naš prostor: tuđi privremeni link nestaje za koji sat. */
async function store(body: Uint8Array, name: string) {
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
  // Ko je napravio model. Bez ovoga se posle ne zna šta vredi zameniti kad
  // deljena kartica jednom bude imala sekundi.
  await s`ALTER TABLE sm_products ADD COLUMN IF NOT EXISTS model_via text`;
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
        const made = await build(p.image_url, resolution, p.title ?? `proizvod ${p.id}`,
                                String(p.vertical ?? ''));
        const saved = await store(made.bytes, `${p.slug}/${p.id}.glb`);
        await s`UPDATE sm_products SET model_url = ${saved.url}, model_state = 'ready',
                model_via = ${made.via}, model_at = now() WHERE id = ${p.id}`;
        done.push(`${p.title} (${Math.round(saved.bytes / 1024)} kB, ${made.via})`);
      } catch (e) {
        // Ovde se stiže samo kad je i naš izvor odustao — nema predmeta na
        // slici, slika se ne otvara. To jeste greška proizvoda i piše se uz
        // njega, a niz se nastavlja: jedna loša fotografija ne zaustavlja
        // ceo katalog.
        const why = String(e).slice(0, 600);
        // Slika sa koje se predmet ne da izrezati nije pad nego granica: takav
        // proizvod ostaje bez modela dok mu se ne promeni fotografija, i ne
        // vraća se u red na svaki sledeći pokušaj.
        const nocut = why.includes(NOCUT);
        await s`UPDATE sm_products SET model_state = ${nocut ? 'nocut' : why},
                model_at = now() WHERE id = ${p.id}`;
        (nocut ? skipped : failed).push(`${p.title}${nocut ? ' (bez reza)' : `: ${why}`}`);
      }
    }
  } finally {
    await s.end({ timeout: 5 });
  }
  return { done, skipped, failed };
}

/**
 * Nijedna greška ne sme da izađe kao „Internal Server Error".
 *
 * Konzola i alati sa druge strane čekaju JSON; gола poruka o padu im je isto
 * što i tišina. Zato se sve hvata ovde i vraća kao uredan odgovor sa razlogom.
 */
Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    return json({ error: String(e).slice(0, 400) }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* prazno telo pada ispod */ }

  if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);
  const action = String(body.action ?? 'status');

  if (action === 'health') {
    return json({
      ok: !!(DB && SUPA && SERVICE),
      // Naš izvor radi i bez tokena; token je samo za tuđu karticu, kad je ima.
      sources: [...SOURCES.map((s) => s.name), 'relief'],
      token: !!HF,
      space: TRELLIS,
    });
  }

  // Kakav je token koji koristimo. Sekunde na deljenoj kartici dobija SAMO
  // token vezan za nalog sa punim pravom čitanja; token ograničenog opsega
  // prolazi prijavu ali nosi nula sekundi, pa greška izgleda kao potrošena
  // kvota iako se ništa nije potrošilo. Vraća se samo ono što nije tajna.
  if (action === 'whoami') {
    if (!HF) return json({ error: 'HF_TOKEN nije podešen' }, 500);
    const r = await fetch('https://huggingface.co/api/whoami-v2', { headers: auth() });
    const text = await r.text();
    if (!r.ok) return json({ status: r.status, body: text.slice(0, 300) }, 502);
    const d = JSON.parse(text);
    return json({
      name: d?.name,
      type: d?.type,
      plan: d?.plan ?? d?.periodEnd ?? null,
      isPro: !!d?.isPro,
      tokenRole: d?.auth?.accessToken?.role ?? null,
      tokenType: d?.auth?.type ?? null,
      fineGrained: !!d?.auth?.accessToken?.fineGrained,
      scopes: d?.auth?.accessToken?.fineGrained
        ? Object.keys(d.auth.accessToken.fineGrained)
        : null,
    });
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
          count(*) FILTER (WHERE p.model_state = 'nocut')::int AS nocut,
          count(*) FILTER (WHERE p.model_state = 'working')::int AS working,
          count(*) FILTER (WHERE p.model_url IS NULL AND p.model_state IS NOT NULL
                             AND p.model_state NOT IN ('skip', 'nocut', 'working'))::int AS failed,
          count(*) FILTER (WHERE p.model_url IS NULL
                             AND (p.model_state IS NULL OR p.model_state = ''))::int AS waiting,
          count(*) FILTER (WHERE p.model_via LIKE 'relief%')::int AS ours
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
    // HF_TOKEN se ne traži. Bez njega se preskaču tuđi izvori i modele pravi
    // naš — a to je ionako ono što se dešava i kad token postoji.
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
            AND p.model_state NOT IN ('skip', 'nocut')
            AND (${slug}::text IS NULL OR t.slug = ${slug}))
        RETURNING id`;
      return json({ reset: rows.length });
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  // Jedna slika → jedan model, bez baze i bez čuvanja. Za proveru: ovako se
  // vidi šta naš izvor pravi od bilo koje fotografije pre nego što se pusti
  // na ceo katalog.
  if (action === 'sample') {
    const src = String(body.image_url ?? '');
    if (!/^https?:\/\//.test(src)) return json({ error: 'image_url nedostaje' }, 400);
    const made = await relief(src, String(body.title ?? 'uzorak'), String(body.vertical ?? ''));
    if (body.stats) return json({ bytes: made.bytes.length, cut: made.cut, tris: made.tris });
    return new Response(made.bytes, {
      headers: { ...cors, 'Content-Type': 'model/gltf-binary' },
    });
  }

  // Zameni naše modele boljima. Radi samo ako deljena kartica zaista ima
  // sekundi — inače bi katalog ostao bez modela koji već rade. Zato se prvo
  // proba jedan jedini proizvod, pa tek ako prođe ide ostatak.
  if (action === 'upgrade') {
    if (!DB) return json({ error: 'baza nije podešena' }, 500);
    if (!HF) return json({ error: 'HF_TOKEN nije podešen' }, 400);
    gpuBlockedUntil = 0;
    const s = sql();
    try {
      await ensureColumns(s);
      const slug = body.slug ? String(body.slug) : null;
      const [probe] = await s`
        SELECT p.image_url FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
        WHERE p.model_via LIKE 'relief%' AND p.image_url IS NOT NULL
          AND (${slug}::text IS NULL OR t.slug = ${slug}) LIMIT 1`;
      if (!probe) return json({ upgraded: 0, why: 'nema naših modela za zamenu' });

      try {
        await SOURCES[0].run(probe.image_url, '512');
      } catch (e) {
        return json({ upgraded: 0, why: String(e).slice(0, 240) });
      }
      const rows = await s`
        UPDATE sm_products SET model_url = NULL, model_state = NULL WHERE id IN (
          SELECT p.id FROM sm_products p JOIN sm_tenants t ON t.id = p.tenant_id
          WHERE p.model_via LIKE 'relief%'
            AND (${slug}::text IS NULL OR t.slug = ${slug}))
        RETURNING id`;
      return json({ upgraded: rows.length });
    } finally {
      await s.end({ timeout: 5 });
    }
  }

  return json({ error: 'nepoznata radnja' }, 400);
}
