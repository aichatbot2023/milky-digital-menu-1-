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
  },
  {
    name: 'openrouter',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: (Deno.env.get('FREE_MODELS') ??
      'nvidia/nemotron-3-nano-30b-a3b:free,qwen/qwen-2.5-vl-7b-instruct:free,google/gemini-2.0-flash-exp:free,meta-llama/llama-3.2-11b-vision-instruct:free'
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

function buildPrompt(roomType: string, ageGroup: string, childName?: string): string {
  const room = ROOM_SR[roomType] ?? 'prostor';
  const age = AGE_SR[ageGroup] ?? ageGroup;
  const child = childName ? ` po imenu ${childName}` : '';
  return `Ti si sertifikovani ekspert za bezbednost dece (childproofing) sa znanjem pedijatrijske epidemiologije povreda (SZO, CDC, EU Child Safety Alliance).

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
- "box" je normalizovan (0–1): x,y gornji levi ugao, w,h širina/visina.
- Ozbiljnost prilagodi razvojnim sposobnostima uzrasta.
- Uključi i opasne ZONE (ivice, stepenice, prozor/terasa bez zaštite, ograda sa razmakom šipki > 10 cm, voda).
- Sve na srpskom jeziku.`;
}

async function callVision(p: Provider, model: string, image: string, prompt: string): Promise<any> {
  const res = await fetch(p.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${p.key}`,
      'Content-Type': 'application/json',
      ...(p.extraHeaders ?? {}),
    },
    body: JSON.stringify({
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
  const { image, roomType = 'living_room', ageGroup = '1-2y', childName } = body ?? {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return json({ error: 'Missing image (data URL)' }, 400);
  if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

  const prompt = buildPrompt(String(roomType), String(ageGroup), childName ? String(childName).slice(0, 40) : undefined);

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
