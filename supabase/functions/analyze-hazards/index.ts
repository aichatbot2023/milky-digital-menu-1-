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
      'nvidia/nemotron-nano-12b-v2-vl:free,nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free'
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

// Prompt je NAMERNO ceo na engleskom: slabiji fallback modeli odgovaraju na
// jeziku samog prompta i ignorišu direktivu. Engleski prompt + "OUTPUT
// LANGUAGE: X" daje pouzdan izlaz na bilo kom od 42 jezika aplikacije.
const ROOM_EN: Record<string, string> = {
  living_room: 'living room',
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  bedroom: 'bedroom / nursery',
  restaurant_table: 'restaurant table',
  outdoor: 'yard or terrace',
};

const AGE_EN: Record<string, string> = {
  '0-6m': '0–6 months (lies down / rolls over, puts everything in the mouth)',
  '6-12m': '6–12 months (crawls, pulls to stand, grabs from low surfaces)',
  '1-2y': '1–2 years (walks, opens drawers and doors, climbs low furniture)',
  '2-4y': '2–4 years (runs, climbs tables and window sills, turns door handles)',
  '4-7y': '4–7 years (uses scissors and devices, imitates adults)',
  '7y+': '7+ years (independent; risks: electricity, chemicals, heights)',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function buildPrompt(roomType: string, ageGroup: string, childName?: string, language = 'Serbian'): string {
  const room = ROOM_EN[roomType] ?? 'room';
  const age = AGE_EN[ageGroup] ?? ageGroup;
  const child = childName ? ` named ${childName}` : '';
  return `OUTPUT LANGUAGE: ${language}. Every human-readable value you produce (label, why, stats, fix, summary) MUST be written entirely in ${language}. NEVER mix languages in a single response. If any source knowledge is in another language, translate it into ${language}.

You are a certified child-safety (childproofing) expert with knowledge of pediatric injury epidemiology (WHO, CDC, EU Child Safety Alliance).

Analyze this photo of a "${room}" and identify ALL visually observable hazards for a child${child} aged ${age}.

Return ONLY valid JSON (no markdown fences) of this exact shape:
{
  "hazards": [{
    "label": "short name of the object/zone, in ${language}",
    "category": "fall|choking|poisoning|burn|electric|cutting|drowning|crush|strangulation|other",
    "severity": "critical|high|medium|low",
    "box": {"x": 0.1, "y": 0.2, "w": 0.15, "h": 0.1},
    "why": "2-3 sentences in ${language} explaining why it is dangerous for this exact age",
    "stats": "real injury statistics with source (WHO/CDC/EU), written in ${language}; never invented numbers",
    "fix": "one concrete step doable right now, in ${language}"
  }],
  "safety_score": 0-100,
  "summary": "2 sentences in ${language}, calm and encouraging tone"
}

Rules:
- Report ONLY what is actually visible in the photo.
- IDENTIFY PRECISELY, especially baby gear: a baby stroller is a STROLLER (not a suitcase), a baby bottle is a BOTTLE (not a glass), a high chair is a HIGH CHAIR (not a chair), carrier/car seat, playpen. If an item is baby gear, assess the risk of that gear (e.g. unbraked stroller, bottle with hot milk), and do NOT report harmless gear.
- "box" is normalized (0–1): x,y top-left corner, w,h width/height.
- Adjust severity to the developmental abilities of the age.
- Also include dangerous ZONES (edges, stairs, unprotected window/balcony, railing with bar gaps > 10 cm, water).
- LANGUAGE: write ALL text values (label, why, stats, fix, summary) in ${language}. This is mandatory.

MANDATORY SMALL-DETAIL SWEEP — inspect the photo carefully, section by section (floor, low surfaces, furniture edges), and report if you spot:
- SMALL OBJECTS on the floor/low surfaces: screws, nails, coins, buttons, small plastic pieces and toy parts, beads, magnets, pebbles — choking/swallowing (critical up to age 3)
- BATTERIES (especially button cells) and devices with easily opened battery covers — chemical esophageal burns
- PENS, pencils, small scissors, forks, toothpicks, sticks — puncture injuries to the eye/palate
- CABLES and CORDS: chargers plugged in, blind/curtain cords, extension cords — strangulation/electricity
- OUTLETS without safety covers at child height
- MEDICINES, vitamins, cosmetics, cleaning products, (plastic!) bags — poisoning/suffocation
- BAGS, balloons (also popped), foils — airway-covering suffocation
- HOT: cups/pots near the edge, handles turned outward, iron, heaters
- GLASS and ceramics within reach; sharp furniture edges at child head height
- UNSTABLE: TV/dressers/shelves without wall anchors, chairs next to windows, ladders
If the photo is blurry or an object is tiny and you are unsure — report it with severity "low" and say in "why" that a manual check is needed, instead of omitting it.

BABY GEAR — recognize it PRECISELY by name and assess its specific risk:
- STROLLER: unlocked brake, stroller on a slope/near stairs, heavy bag hung on the handle (tips backward), stroller next to a stove/heater
- BABY BOTTLES: glass bottle at the edge of a surface, bottle left in the sun or near heat (overheated milk), bottle in the crib with a sleeping baby
- PACIFIER: pacifier on a strap/chain/cord (strangulation!), pacifier on the floor (hygiene), visibly cracked or old pacifier (piece breaks off — choking)
- DIAPERS / CHANGING TABLE: changing pad at height with no rail, creams/powders/wet wipes within the child's reach
- TOYS: small parts and older siblings' toys within a baby's reach, balloons (also popped), battery toys with loose covers, plush toys in the crib of a baby under 12 months
- BAG (child's or parent's): contents within reach — medicines, small items, lighters
- WINDOWS — ALWAYS CHECK AND REPORT: an open or ajar window in the room, window handle at child height, chair/sofa/bed/dresser NEXT TO a window (child climbs and reaches), window without a safety lock. Falls through windows are among the most severe injuries of small children — report this even with moderate confidence.

HEIGHT DIFFERENCES AND SPATIAL ANALYSIS — estimate depth and heights in the photo:
- STAIRS and single steps/floor level changes: report if there is no safety gate (top AND bottom); even a single step is a risk for a child learning to walk
- BALCONY/TERRACE/GALLERY: estimate railing height (safe ≥ 110 cm), bar gaps (≤ 10 cm), and whether the railing has HORIZONTAL bars or furniture next to it (child climbs it like a ladder)
- ESTIMATE FALL HEIGHT for every raised surface a child can get onto (bed, table, countertop, window sill, bunk bed): falls > 60 cm for a baby and > 1 m for a toddler raise to high/critical
- CLIMBING CHAIN: combinations of objects forming a "ladder" (step stool → chair → table → shelf/window) report as ONE hazard explaining the chain
- MANHOLES, basement doors, holes in the yard, uncovered shafts
- For every reported height hazard include an approximate estimated height in "why" (e.g. "railing ~90 cm — below the safe 110 cm")

ANTI-GENERALIZATION — verify an object's identity by CONTEXT before reporting:
- An object ON THE CEILING is a ceiling light/chandelier/smoke detector/fan — NEVER a ball, disc, frisbee or toy
- An object ON THE WALL is a clock/picture/thermostat/switch — verify before declaring it a dangerous object
- Round object: distinguish ceiling light / clock / plate / ball by POSITION and SURROUNDINGS
- If identity is unclear from context, do NOT invent an exotic object — describe it generically ("round object on a shelf") or omit it if it is not dangerous
- Better to omit a harmless ceiling light than to report a "flying disc" — a wrong identification destroys parents' trust

ANIMALS — recognize and assess:
- DOG/CAT: animal in the same room as a baby with no adult in between; dog next to food/a toy (resource guarding); pet bed next to the crib
- pet FOOD AND WATER BOWLS: kibble is a choking risk, water for a crawling baby
- LITTER BOX: reachable by the child — infection risk (toxoplasmosis)
- AQUARIUM/TERRARIUM: glass + water + heater/electricity + tipping risk; unlocked terrarium lid
- CAGES (birds, rodents): fingers through bars — bites; unlocked cage doors
- LEASHES, chains and animal ropes: strangulation
- YARD: farm animals (horse/cow — kick, trampling), fence between child and animals, wasp/hornet nests, rodent traces

FINAL LANGUAGE CHECK: before answering, re-read every label, why, stats, fix and summary — each one must be 100% in ${language}. If any value is in another language, translate it before returning the JSON.`;
}

async function callVision(p: Provider, model: string, image: string, prompt: string, language = 'Serbian'): Promise<any> {
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
      // OpenRouter reasoning modeli: bez razmišljanja (brzina)
      ...(p.name === 'openrouter' && model.includes('reasoning')
        ? { reasoning: { enabled: false } }
        : {}),
      model,
      max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: `You are a child-safety vision expert. CRITICAL: write EVERY human-readable output value strictly in ${language}. Never use any other language, never mix languages, regardless of the prompt's language.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
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
  parsed._v = 3;
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
        return json(await callVision(provider, model, image, prompt, String(language).slice(0, 30)));
      } catch (e: any) {
        errors.push(e?.message ?? String(e));
      }
    }
  }
  console.error('all providers failed:', errors.join(' | '));
  return json({ error: `Svi AI provajderi trenutno nedostupni. Pokušajte za minut. (${errors[errors.length - 1]})` }, 502);
});
