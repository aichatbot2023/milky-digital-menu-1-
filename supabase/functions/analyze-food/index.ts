/**
 * analyze-food — AI provera hrane i pića za decu po uzrastu.
 * Roditelj slika obrok, namirnicu, piće ili ETIKETU proizvoda; AI vraća:
 * sme / uz oprez / ne sme za dati uzrast, sporne sastojke, alergene,
 * rizik gušenja i kako bezbedno pripremiti/servirati.
 *
 * Isti freeLlmRouter lanac besplatnih provajdera kao analyze-hazards.
 * Body: { image: data URL, ageGroup, childName? }
 * Vraća: { food_name, verdict, items[], allergens[], choking, prep_tip,
 *          summary, _provider, _model }
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

const PROVIDERS: Provider[] = [
  {
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

const AGE_SR: Record<string, string> = {
  '0-6m': '0–6 meseci (isključivo mleko — dojenje ili formula; čvrsta hrana se još ne uvodi)',
  '6-12m': '6–12 meseci (uvođenje čvrste hrane; BEZ meda, soli, šećera i kravljeg mleka kao glavnog napitka)',
  '1-2y': '1–2 godine (jede raznovrsno, ali gušenje je i dalje veliki rizik)',
  '2-4y': '2–4 godine (gušenje i dalje rizik — grožđe, viršle, kokice, orasi u komadu)',
  '4-7y': '4–7 godina (oprez sa celim orašastim plodovima i tvrdim bombonama)',
  '7y+': '7+ godina (bez energetskih pića i kofeina; umeren šećer i so)',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function buildPrompt(ageGroup: string, childName?: string, language = 'Serbian'): string {
  const age = AGE_SR[ageGroup] ?? ageGroup;
  const child = childName ? ` po imenu ${childName}` : '';
  return `Ti si pedijatrijski nutricionista i ekspert za bezbednost ishrane dece (SZO, AAP, ESPGHAN smernice).

Na fotografiji je hrana, piće, obrok ili ETIKETA proizvoda. Proceni da li je bezbedno za dete${child} uzrasta: ${age}.

Vrati ISKLJUČIVO validan JSON (bez markdown ograda):
{
  "food_name": "šta je na slici (kratko)",
  "verdict": "safe|caution|unsafe",
  "items": [{"name": "sastojak/namirnica", "status": "safe|caution|unsafe", "why": "1-2 rečenice zašto, za OVAJ uzrast"}],
  "allergens": ["mleko", "jaja", "kikiriki", "..."],
  "choking": "opis rizika gušenja i kako ga ukloniti, ili null ako ga nema",
  "prep_tip": "kako bezbedno pripremiti/iseći/servirati za ovaj uzrast",
  "summary": "2 rečenice, smiren ton, jasna preporuka"
}

OBAVEZNA PRAVILA (primeni ih strogo):
- MED: strogo zabranjen do 12 meseci (botulizam) — verdict "unsafe" ako je dete mlađe.
- GUŠENJE do 4 godine: celo grožđe, viršle u kolutovima, kokice, tvrde bombone, celi orašasti plodovi, žvake, komadi tvrdog sirovog voća/povrća — uvek navedi kako iseći (grožđe i viršle PO DUŽINI na četvrtine).
- Kravlje mleko kao glavni napitak tek posle 12 meseci; punomasno 1–2 godine.
- BEZ dodate soli i šećera do 12 meseci; minimalno do 2 godine.
- Kofein i energetska pića: zabranjeni za svu decu.
- Alkohol i nepasterizovani proizvodi (sir, mleko, sokovi): zabranjeni.
- Cela jaja/riba/kikiriki: dozvoljeni od 6m kao pažljivo uvođenje alergena (jedan po jedan, pratiti reakciju) — označi kao "caution" sa objašnjenjem, ne "unsafe".
- Ako je na slici ETIKETA, pročitaj sastav i proveri svaki sporan sastojak (zaslađivači, kofein, alergeni, procenat soli/šećera).
- Ako se sa slike ne vidi dovoljno, reci to u summary i traži sliku etikete/sastava.
- 14 glavnih alergena EU: gluten, rakovi, jaja, riba, kikiriki, soja, mleko, orašasti plodovi, celer, slačica, susam, sumpor-dioksid, lupina, mekušci.
- LANGUAGE: Write ALL text values (food_name, items, allergens, choking, prep_tip, summary) in ${language}. This is mandatory. Remind that for known allergies the paediatrician decides.`;
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
      max_tokens: 3000,
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
  if (!out.startsWith('{')) {
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`${p.name}/${model}: no JSON in response`);
    out = m[0];
  }
  const parsed = JSON.parse(out);
  if (!parsed.food_name || !parsed.verdict) throw new Error(`${p.name}/${model}: bad shape`);
  if (!['safe', 'caution', 'unsafe'].includes(parsed.verdict)) parsed.verdict = 'caution';
  parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
  parsed.allergens = Array.isArray(parsed.allergens) ? parsed.allergens : [];
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
  const { image, ageGroup = '1-2y', childName, language = 'Serbian' } = body ?? {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return json({ error: 'Missing image (data URL)' }, 400);
  if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

  const prompt = buildPrompt(String(ageGroup), childName ? String(childName).slice(0, 40) : undefined, String(language).slice(0, 30));

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
