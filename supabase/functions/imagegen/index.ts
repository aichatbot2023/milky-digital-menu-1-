// Interni alat: generisanje vizuala za SpaceMatch / SafeNest.
// Koristi kljuceve koje vec imamo (NVIDIA NIM, pa Hugging Face) — nista novo se ne placa.
// Zasticeno ADMIN_KEY-em; nije deo proizvoda i ne poziva ga nijedna stranica.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NVIDIA = Deno.env.get('NVIDIA_NIM_API_KEY') ?? '';
const HF = Deno.env.get('HF_TOKEN') ?? '';
const ADMIN = Deno.env.get('ADMIN_KEY') ?? '';

type Job = {
  prompt: string;
  negative?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/**
 * Čekanje po pozivu je 45 s, ne 120 s.
 *
 * Sa 120 s po generatoru lanac od dva pokušaja traje 240 s, a edge funkcija
 * toliko ne živi — pa se ubije pre nego što stigne da javi ijedan razlog.
 * Tako je ispadalo da „ništa ne radi", dok je prava poruka (401 sa NVIDIA)
 * čekala u pozivu koji nikad nije završen. Kratko čekanje daje lošu vest
 * brzo, a loša vest koja stigne vredi više od dobre koja ne stigne.
 */
async function post(url: string, key: string, body: unknown, ms = 45000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await r.text();
    return { ok: r.ok, status: r.status, text };
  } finally {
    clearTimeout(timer);
  }
}

// NVIDIA vraca base64 na nekoliko razlicitih mesta zavisno od modela.
function pickB64(text: string): string | null {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const a = data?.artifacts;
  if (Array.isArray(a) && a[0]?.base64) return a[0].base64;
  if (typeof data?.image === 'string' && data.image.length > 1000) return data.image;
  const d = data?.data;
  if (Array.isArray(d) && d[0]?.b64_json) return d[0].b64_json;
  if (Array.isArray(d) && typeof d[0] === 'string' && d[0].length > 1000) return d[0];
  return null;
}

// Sirina i visina moraju biti deljive sa 16 da flux ne odbije zahtev.
/**
 * NVIDIA flux prima SAMO ove dimenzije, ne bilo koji umnožak šesnaest.
 *
 * Dotadašnje zaokruživanje na 16 je prolazilo kroz našu proveru i padalo na
 * njihovoj: 512 px je uredan umnožak šesnaest i savršeno neispravna
 * vrednost. Greška se videla tek kao 422 sa spiskom dozvoljenih brojeva,
 * a pošto je probni poziv koristio baš 512, ispadalo je da su svi generatori
 * mrtvi iako su dva radila.
 *
 * Zato se traženo NE zaokružuje nego se bira najbliža dozvoljena vrednost.
 */
const ALLOWED = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344];
const grid = (n: number) =>
  ALLOWED.reduce((best, v) => (Math.abs(v - n) < Math.abs(best - n) ? v : best), ALLOWED[0]);

async function flux(model: string, job: Job) {
  const width = grid(job.width ?? 1024);
  const height = grid(job.height ?? 1024);
  // SCHNELL NIJE DEV SA MANJE KORAKA — traži DRUGE parametre.
  //
  // Ovde je do sada stajalo `job.cfg ?? (schnell ? 3.5 : 3.5)`: uslov koji ne
  // radi ništa, jer su obe grane iste, a prosleđen `cfg` ionako pretiče. Zbog
  // toga je schnell na svaki poziv vraćao 422 — njegov API traži `cfg_scale`
  // manje ili jednako nuli, jer je to destilovan model koji ne koristi
  // vođenje. Brzi rezervni generator dakle nikad nije mogao da proradi, i to
  // se videlo tek kad je flux.1-dev pao: ostali smo bez ijedne slike iako je
  // rezerva postojala u kodu.
  //
  // Zato se za schnell vrednosti NAMEĆU, a ne predlažu: pozivalac ne mora da
  // zna razliku između dva modela da bi dobio sliku.
  const isSchnell = model.includes('schnell');
  const body: Record<string, unknown> = {
    prompt: job.prompt,
    mode: 'base',
    cfg_scale: isSchnell ? 0 : (job.cfg ?? 3.5),
    width,
    height,
    seed: job.seed ?? 0,
    steps: isSchnell ? Math.min(job.steps ?? 4, 4) : (job.steps ?? 40),
  };
  const r = await post(`https://ai.api.nvidia.com/v1/genai/black-forest-labs/${model}`, NVIDIA, body);
  if (!r.ok) return { error: `${model} ${r.status}: ${r.text.slice(0, 300)}` };
  const b64 = pickB64(r.text);
  return b64 ? { b64, via: `nvidia/${model}` } : { error: `${model}: nema slike u odgovoru — ${r.text.slice(0, 300)}` };
}

async function sd35(job: Job) {
  const body: Record<string, unknown> = {
    prompt: job.prompt,
    negative_prompt: job.negative ?? '',
    aspect_ratio: ratio(job.width ?? 1024, job.height ?? 1024),
    cfg_scale: job.cfg ?? 4.5,
    seed: job.seed ?? 0,
    steps: job.steps ?? 40,
  };
  // Putanja je vraćala 404. Ispravan oblik je `.../stability/...`, ne
  // `.../stabilityai/...` — jedna reč zbog koje je treći generator u lancu
  // bio mrtav, a niko to nije primetio dok prva dva nisu pala istog dana.
  const r = await post(
    'https://ai.api.nvidia.com/v1/genai/stability/stable-diffusion-3-5-large',
    NVIDIA,
    body,
  );
  if (!r.ok) return { error: `sd3.5 ${r.status}: ${r.text.slice(0, 300)}` };
  const b64 = pickB64(r.text);
  return b64 ? { b64, via: 'nvidia/sd3.5-large' } : { error: `sd3.5: nema slike — ${r.text.slice(0, 300)}` };
}

// SD 3.5 prima samo imenovane odnose stranica, ne proizvoljne piksele.
function ratio(w: number, h: number) {
  const options: Array<[string, number]> = [
    ['1:1', 1], ['16:9', 16 / 9], ['9:16', 9 / 16], ['4:5', 4 / 5],
    ['5:4', 5 / 4], ['3:2', 3 / 2], ['2:3', 2 / 3], ['21:9', 21 / 9], ['9:21', 9 / 21],
  ];
  const want = w / h;
  let best = options[0];
  for (const o of options) if (Math.abs(o[1] - want) < Math.abs(best[1] - want)) best = o;
  return best[0];
}

async function hface(job: Job) {
  if (!HF) return { error: 'HF_TOKEN nije podesen' };
  const r = await fetch(
    'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${HF}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: job.prompt,
        parameters: { width: grid(job.width ?? 1024), height: grid(job.height ?? 1024) },
      }),
    },
  );
  if (!r.ok) return { error: `hf ${r.status}: ${(await r.text()).slice(0, 300)}` };
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 8192) {
    s += String.fromCharCode(...buf.subarray(i, i + 8192));
  }
  return { b64: btoa(s), via: 'hf/flux-schnell' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  let body: any = {};
  try {
    body = await req.json();
  } catch { /* prazno telo je greska ispod */ }

  if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);

  if (body.action === 'probe') {
    const tiny: Job = { prompt: 'a plain sand coloured wall, soft daylight', width: 512, height: 512, steps: 4 };
    const out: Record<string, string> = {};
    for (const [name, fn] of [
      ['flux.1-schnell', () => flux('flux.1-schnell', tiny)],
      ['flux.1-dev', () => flux('flux.1-dev', tiny)],
      ['sd3.5-large', () => sd35(tiny)],
      ['hf', () => hface(tiny)],
    ] as Array<[string, () => Promise<any>]>) {
      try {
        const r = await fn();
        out[name] = r.b64 ? `ok (${r.b64.length} b64)` : String(r.error);
      } catch (e) {
        out[name] = `pao: ${String(e)}`;
      }
    }
    return json({ probe: out, has: { nvidia: !!NVIDIA, hf: !!HF } });
  }

  const job: Job = {
    prompt: String(body.prompt ?? ''),
    negative: body.negative ? String(body.negative) : undefined,
    width: Number(body.width) || 1024,
    height: Number(body.height) || 1024,
    seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : 0,
    steps: Number(body.steps) || undefined,
    cfg: Number(body.cfg) || undefined,
  };
  if (!job.prompt) return json({ error: 'prompt je obavezan' }, 400);

  const chain: Array<[string, () => Promise<any>]> = [];
  const want = String(body.model ?? 'flux.1-dev');
  if (want === 'flux.1-schnell') chain.push(['flux.1-schnell', () => flux('flux.1-schnell', job)]);
  else chain.push(['flux.1-dev', () => flux('flux.1-dev', job)]);
  chain.push(['flux.1-schnell', () => flux('flux.1-schnell', job)]);
  // sd3.5 je izbačen iz lanca: obe poznate putanje vraćaju 404, pa je samo
  // trošio vreme pre poslednjeg pokušaja i zamagljivao pravi razlog pada.
  // Kad se nađe ispravna putanja, vraća se jednim redom.
  chain.push(['hf', () => hface(job)]);

  const tried: string[] = [];
  for (const [name, fn] of chain) {
    try {
      const r = await fn();
      if (r.b64) return json({ b64: r.b64, via: r.via });
      tried.push(`${name}: ${r.error}`);
    } catch (e) {
      tried.push(`${name}: ${String(e)}`);
    }
  }
  return json({ error: 'nijedan generator nije uspeo', tried }, 502);
});
