/**
 * analyze-hazards — AI detekcija opasnosti po decu na fotografiji prostora.
 *
 * Koristi ISTI AI API obrazac kao OMNI kamere (ai-team-meeting-studio):
 * OpenRouter vision chat/completions, isti OPENROUTER_API_KEY secret,
 * primarni jeftini vision model + besplatni fallback.
 *
 * Body: { image: JPEG/PNG data URL, roomType, ageGroup, childName? }
 * Vraća: { hazards: [...], safety_score, summary }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OPENROUTER_KEY = Deno.env.get('OPENROUTER_API_KEY') ?? '';
// Isti izbor modela kao u omni describe-incident: jeftin vision primarni, free fallback
const MODEL      = 'google/gemini-2.5-flash-lite';
const MODEL_FREE = 'qwen/qwen-2.5-vl-7b-instruct:free';

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

async function callVision(model: string, image: string, prompt: string): Promise<any> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://omnimeeting.app',
      'X-Title': 'SafeNest AI',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  const data = await res.json();
  let out: string = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('empty response');
  // Skini eventualne markdown ograde
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed.hazards)) throw new Error('bad shape');
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!OPENROUTER_KEY) return json({ error: 'AI analiza nije konfigurisana (nedostaje OPENROUTER_API_KEY).' }, 501);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { image, roomType = 'living_room', ageGroup = '1-2y', childName } = body ?? {};
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return json({ error: 'Missing image (data URL)' }, 400);
  if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

  const prompt = buildPrompt(String(roomType), String(ageGroup), childName ? String(childName).slice(0, 40) : undefined);

  try {
    return json(await callVision(MODEL, image, prompt));
  } catch {
    try {
      return json(await callVision(MODEL_FREE, image, prompt));
    } catch (e: any) {
      return json({ error: `AI analiza nije uspela: ${e.message}` }, 502);
    }
  }
});
