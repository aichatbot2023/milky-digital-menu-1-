/**
 * analyze-hazards — AI detekcija opasnosti po decu na fotografiji prostora.
 *
 * VIŠE BESPLATNIH PROVAJDERA sa automatskim prebacivanjem: kada se jedan
 * potroši (429/402) ili padne, prelazi se na sledeći. Svi ključevi već
 * postoje na omni Supabase projektu (ai-team-meeting-studio).
 *
 * Redosled: OpenRouter free modeli → Groq (llama-4 vision, free tier)
 *           → Lovable AI gateway (gemini-2.5-flash).
 *
 * Body: { image: JPEG/PNG data URL, roomType, ageGroup, childName? }
 * Vraća: { hazards: [...], safety_score, summary, _provider, _model }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Provider {
  name: string;
  key: string | undefined;
  url: string;
  models: string[];
  extraHeaders?: Record<string, string>;
  /** Dodatna polja u telu zahteva (npr. isključenje reasoning-a). */
  extraBody?: Record<string, unknown>;
}

// Lanac provajdera — freeLlmRouter obrazac (lovable-chatbot-studio):
// svi OpenAI-kompatibilni (chat/completions + image_url), ključevi u Supabase
// secrets, provajder bez ključa se preskače, failover na 402/429/greške.
// FREE_MODELS env pregazi OpenRouter listu modela.
const PROVIDERS: Provider[] = [
  {
    // PRIMARNI: NVIDIA Nemotron OMNI — multimodalni agent za slike/video
    name: 'nvidia',
    key: Deno.env.get('NVIDIA_NIM_API_KEY'),
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'],
    // KLJUČNO ZA BRZINU: bez ovoga reasoning model "razmišlja" 40-60s po
    // slici, pa klijent odustane. Sa isključenim razmišljanjem: par sekundi.
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
  {
    name: 'openrouter',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: (Deno.env.get('FREE_MODELS') ??
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,nvidia/nemotron-nano-12b-v2-vl:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free'
    ).split(',').map((m) => m.trim()).filter(Boolean),
    extraHeaders: { 'HTTP-Referer': 'https://omnimeeting.app', 'X-Title': 'SafeNest AI' },
  },
  {
    name: 'gemini',
    key: Deno.env.get('GEMINI_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.5-flash'],
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

const ROOM_SR: Record<string, string> = {
  living_room: 'dnevna soba',
  kitchen: 'kuhinja',
  bathroom: 'kupatilo',
  bedroom: 'spavaća soba',
  restaurant_table: 'restoranski sto',
  outdoor: 'dvorište ili terasa',
};

const AGE_SR: Record<string, string> = {
  '0-6m': '0–6 meseci (beba koja leži/prevrne se, sve stavlja u usta)',
  '6-12m': '6–12 meseci (puzi, pridržava se, dohvata sa niskih površina)',
  '1-2y': '1–2 godine (hoda, otvara fioke i vrata, penje se na nizak nameštaj)',
  '2-4y': '2–4 godine (trči, penje se na sto i prozorske daske, okreće kvake)',
  '4-7y': '4–7 godina (koristi makaze i uređaje, imitira odrasle)',
  '7y+': '7+ godina (samostalno; rizici: struja, hemikalije, visina)',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function buildPrompt(roomType: string, ageGroup: string, childName?: string, language = 'Serbian'): string {
  const room = ROOM_SR[roomType] ?? 'prostor';
  const age = AGE_SR[ageGroup] ?? ageGroup;
  const child = childName ? ` po imenu ${childName}` : '';
  return `OUTPUT LANGUAGE: ${language}. Every human-readable value you produce (label, why, stats, fix, summary) MUST be written entirely in ${language}. NEVER mix languages in a single response. If any source knowledge is in another language, translate it to ${language}.

Ti si sertifikovani ekspert za bezbednost dece (childproofing) sa znanjem pedijatrijske epidemiologije povreda (SZO, CDC, EU Child Safety Alliance).

Analiziraj fotografiju prostora tipa "${room}" i identifikuj SVE vizuelno uočljive opasnosti za dete${child} uzrasta ${age}.

Vrati ISKLJUČIVO validan JSON (bez markdown ograda) ovog oblika:
{
  "hazards": [{
    "label": "kratak naziv objekta/zone",
    "category": "fall|choking|poisoning|burn|electric|cutting|drowning|crush|strangulation|other",
    "severity": "critical|high|medium|low",
    "box": {"x": 0.1, "y": 0.2, "w": 0.15, "h": 0.1},
    "why": "2-3 rečenice zašto je opasno baš za ovaj uzrast",
    "stats": "stvarna statistika povreda sa izvorom (SZO/CDC/EU); nikad izmišljeni brojevi",
    "fix": "konkretan korak izvodljiv odmah"
  }],
  "safety_score": 0-100,
  "summary": "2 rečenice, smiren i ohrabrujući ton"
}

Pravila:
- Prijavi SAMO ono što se zaista vidi na slici.
- IDENTIFIKUJ TAČNO, posebno dečju opremu: bebeća kolica su KOLICA (ne kofer), bebeća flašica je FLAŠICA (ne čaša), hranilica je HRANILICA (ne stolica), nosiljka/autosedište, ogradica za igru. Ako je predmet dečja oprema, oceni rizik te opreme (npr. nezakočena kolica, flašica sa vrelim mlekom), a bezopasnu opremu NE prijavljuj.
- "box" je normalizovan (0–1): x,y gornji levi ugao, w,h širina/visina.
- Ozbiljnost prilagodi razvojnim sposobnostima uzrasta.
- Uključi i opasne ZONE (ivice, stepenice, prozor/terasa bez zaštite, ograda sa razmakom šipki > 10 cm, voda).
- LANGUAGE: Write ALL text values (label, why, stats, fix, summary) in ${language}. This is mandatory.

OBAVEZNA PROVERA SITNIH DETALJA — pregledaj sliku pažljivo, deo po deo (pod, niske površine, ivice nameštaja), i prijavi ako uočiš:
- SITNE PREDMETE na podu/niskim površinama: šrafovi, ekseri, novčići, dugmad, sitna plastika i delovi igračaka, perle, magneti, kamenčići — gušenje/gutanje (kritično do 3 g.)
- BATERIJE (posebno dugmaste) i uređaje sa lako otvorivim poklopcem baterija — hemijske opekotine jednjaka
- OLOVKE, hemijske, makazice, viljuške, čačkalice, štapiće — ubodne povrede oka/nepca
- KABLOVE i GAJTANE: punjači u utičnici, gajtani roletni/zavesa, produžni kablovi — davljenje/struja
- UTIČNICE bez zaštitnih poklopaca u visini deteta
- LEKOVE, vitamine, kozmetiku, sredstva za čišćenje, kese (plastične!) — trovanje/gušenje
- KESE, baloni (i pukli), folije — gušenje prekrivanjem disajnih puteva
- VRUĆE: šolje/šerpe blizu ivice, ručke okrenute ka spolja, peglu, grejalice
- STAKLO i keramiku na dohvat; oštre ivice nameštaja u visini glave deteta
- NESTABILNO: TV/komode/police bez zidnog ankera, stolice uz prozor, merdevine
Ako je slika mutna ili predmet sitan pa nisi siguran — prijavi ga sa severity "low" i u "why" napiši da je potrebna ručna provera, umesto da ga izostaviš.

DEČJA OPREMA — prepoznaj je TAČNO po imenu i proceni njen specifičan rizik:
- KOLICA ZA BEBE: nezakočena kočnica, kolica na nagibu/uz stepenice, teška torba okačena na ručku (prevrtanje unazad), kolica uz šporet/grejalicu
- FLAŠICE ZA BEBE: staklena flašica na ivici površine, flašica ostavljena na suncu ili uz izvor toplote (pregrejano mleko), flašica u krevecu kod bebe koja spava
- DUDA/CUCLA: duda na traci/lančiću/kanapu (davljenje!), duda na podu (higijena), vidljivo napukla ili stara duda (otkidanje dela — gušenje)
- PELENE / STO ZA PREVIJANJE: podloga za previjanje na visini bez ograde, kreme/puderi/vlažne maramice u dometu deteta
- IGRAČKE: sitni delovi i igračke starije dece u dometu bebe, baloni (i pukli), igračke sa baterijama sa labavim poklopcem, plišane igračke u krevecu bebe do 12 meseci
- TORBA (dečja ili roditeljska): sadržaj u dometu — lekovi, sitnice, upaljači
- PROZORI — UVEK PROVERI I PRIJAVI: otvoren ili odškrinut prozor u prostoriji, kvaka prozora u visini deteta, stolica/kauč/krevet/komoda UZ prozor (dete se popne i dohvati), prozor bez sigurnosne bravice. Padovi kroz prozor su među najtežim povredama male dece — ovo prijavi čak i sa umerenom sigurnošću.

VISINSKE RAZLIKE I PROSTORNA ANALIZA — proceni dubinu i visine na slici:
- STEPENICE i stepenik/denivelacija poda: prijavi ako nema sigurnosne kapije (gore I dole); i jedan jedini stepenik je rizik za dete koje prohodava
- BALKON/TERASA/GALERIJA: proceni visinu ograde (bezbedno ≥ 110 cm), razmak šipki (≤ 10 cm), i da li ograda ima HORIZONTALNE prečke ili nameštaj uz nju (dete se penje kao uz merdevine)
- PROCENI VISINU PADA za svaku povišenu površinu na kojoj dete može da se nađe (krevet, sto, radna površina, prozorska daska, krevet na sprat): pad > 60 cm za bebu i > 1 m za malo dete podigni na high/critical
- LANAC PENJANJA: kombinacije predmeta koje formiraju "merdevine" (hoklica → stolica → sto → polica/prozor) prijavi kao JEDNU opasnost sa objašnjenjem lanca
- ŠAHTOVI, podrumska vrata, rupe u dvorištu, nepokrivena okna
- Za svaku prijavljenu visinsku opasnost u "why" navedi približnu procenjenu visinu (npr. "ograda ~90 cm — ispod bezbednih 110 cm")

ANTI-GENERALIZACIJA — identitet predmeta proveri KONTEKSTOM pre prijave:
- Objekat NA PLAFONU je plafonjera/luster/detektor dima/ventilator — NIKAD lopta, disk, frizbi ili igračka
- Objekat NA ZIDU je sat/slika/termostat/prekidač — proveri pre nego što ga proglasiš opasnim predmetom
- Okrugao predmet: razlikuj plafonjeru / sat / tanjir / loptu po POLOŽAJU i OKRUŽENJU
- Ako identitet nije jasan iz konteksta, NE izmišljaj egzotičan predmet — opiši ga generički ("okrugao predmet na polici") ili ga izostavi ako nije opasan
- Bolje je izostaviti bezopasnu plafonjeru nego prijaviti "leteći disk" — pogrešna identifikacija ruši poverenje roditelja

ŽIVOTINJE — prepoznaj i proceni:
- PAS/MAČKA: životinja u istoj prostoriji sa bebom bez odrasle osobe između; pas uz hranu/igračku (čuvanje resursa); korpa/ležaljka uz krevetac
- ZDELE sa hranom i vodom ljubimaca: granule su rizik gušenja, voda za bebu koja puzi
- KUTIJA ZA PESAK (mačji toalet): dohvatljiva detetu — rizik infekcije (toksoplazmoza)
- AKVARIJUM/TERARIJUM: staklo + voda + grejač/struja + mogućnost prevrtanja; poklopac terarijuma nezaključan
- KAVEZI (ptice, glodari): prsti kroz rešetke — ujedi; vrata kaveza nezaključana
- POVODCI, lančevi i užad životinja: davljenje
- DVORIŠTE: seoske životinje (konj/krava — udarac, nagaz), ograda između deteta i životinja, gnezda osa/stršljenova, tragovi glodara`;
}

async function callVision(p: Provider, model: string, image: string, prompt: string): Promise<any> {
  const res = await fetch(p.url, {
    method: 'POST',
    // Timeout po provajderu: zaglavljeni provajder ne sme da pojede ceo zahtev
    signal: AbortSignal.timeout(30000),
    headers: {
      'Authorization': `Bearer ${p.key}`,
      'Content-Type': 'application/json',
      ...(p.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      ...(p.extraBody ?? {}),
      model,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`${p.name}/${model}: upstream ${res.status}`);
  const data = await res.json();
  let out: string = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error(`${p.name}/${model}: empty response`);
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  // Neki modeli dodaju tekst oko JSON-a — izvuci prvi {...} blok
  if (!out.startsWith('{')) {
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`${p.name}/${model}: no JSON in response`);
    out = m[0];
  }
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed.hazards)) throw new Error(`${p.name}/${model}: bad shape`);
  // Ograniči box vrednosti na 0-1
  parsed.hazards = parsed.hazards.map((h: any) => ({
    ...h,
    box: {
      x: Math.max(0, Math.min(1, Number(h.box?.x) || 0)),
      y: Math.max(0, Math.min(1, Number(h.box?.y) || 0)),
      w: Math.max(0.02, Math.min(1, Number(h.box?.w) || 0.1)),
      h: Math.max(0.02, Math.min(1, Number(h.box?.h) || 0.1)),
    },
  }));
  parsed.safety_score = Math.max(0, Math.min(100, Number(parsed.safety_score) || 0));
  parsed._v = 2;
  parsed._provider = p.name;
  parsed._model = model;
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const active = PROVIDERS.filter((p) => p.key);
  if (active.length === 0) return json({ error: 'Nijedan AI provajder nije konfigurisan.' }, 501);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { image, roomType = 'living_room', ageGroup = '1-2y', childName, language = 'Serbian' } = body ?? {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return json({ error: 'Missing image (data URL)' }, 400);
  if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

  const prompt = buildPrompt(String(roomType), String(ageGroup), childName ? String(childName).slice(0, 40) : undefined, String(language).slice(0, 30));

  const errors: string[] = [];
  for (const provider of active) {
    for (const model of provider.models) {
      try {
        return json(await callVision(provider, model, image, prompt));
      } catch (e: any) {
        errors.push(e?.message ?? String(e));
      }
    }
  }
  console.error('all providers failed:', errors.join(' | '));
  return json({ error: `Svi AI provajderi trenutno nedostupni. Pokušajte za minut. (${errors[errors.length - 1]})` }, 502);
});
