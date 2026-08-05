import { providers, languageRules, isAsleep, noteFailure, TRY_MS, type Provider } from '../_shared/ai.ts';
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

const PROVIDERS: Provider[] = providers();

// Prompt je NAMERNO ceo na engleskom: slabiji fallback modeli odgovaraju na
// jeziku samog prompta i ignorišu direktivu. Engleski prompt + "OUTPUT
// LANGUAGE: X" daje pouzdan izlaz na bilo kom od 42 jezika aplikacije.
const AGE_EN: Record<string, string> = {
  '0-6m': '0–6 months (milk only — breastfeeding or formula; solids not yet introduced)',
  '6-12m': '6–12 months (introducing solids; NO honey, salt, sugar, or cow milk as the main drink)',
  '1-2y': '1–2 years (eats a varied diet, but choking is still a major risk)',
  '2-4y': '2–4 years (choking still a risk — whole grapes, hot dog rounds, popcorn, whole nuts)',
  '4-7y': '4–7 years (caution with whole nuts and hard candies)',
  '7y+': '7+ years (no energy drinks or caffeine; moderate sugar and salt)',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function buildPrompt(ageGroup: string, childName?: string, language = 'Serbian'): string {
  const age = AGE_EN[ageGroup] ?? ageGroup;
  const child = childName ? ` named ${childName}` : '';
  return `OUTPUT LANGUAGE: ${language}. Every value (food_name, items, allergens, choking, prep_tip, summary) MUST be written entirely in ${language}. NEVER mix languages. If any source knowledge is in another language, translate it into ${language}.

VOCABULARY: use natural, correct, everyday words that a native ${language} speaker would use. NEVER invent words or transliterate from other languages. Report ONLY what you can clearly see and confidently identify — never invent foods or ingredients.

${languageRules(language)}

You are a pediatric nutritionist and child food-safety expert (WHO, AAP, ESPGHAN guidelines).

The photo shows food, a drink, a meal, or a product LABEL. Assess whether it is safe for a child${child} aged: ${age}.

Return ONLY valid JSON (no markdown fences):
{
  "food_name": "what is in the photo (short), in ${language}",
  "verdict": "safe|caution|unsafe",
  "items": [{"name": "ingredient/food item in ${language}", "status": "safe|caution|unsafe", "why": "1-2 sentences in ${language} why, for THIS age"}],
  "allergens": ["allergen names in ${language}"],
  "choking": "description in ${language} of the choking risk and how to remove it, or null if none",
  "prep_tip": "how to safely prepare/cut/serve for this age, in ${language}",
  "summary": "2 sentences in ${language}, calm tone, clear recommendation"
}

MANDATORY RULES (apply strictly):
- HONEY: strictly forbidden under 12 months (botulism) — verdict "unsafe" if the child is younger.
- CHOKING up to age 4: whole grapes, hot dog rounds, popcorn, hard candies, whole nuts, chewing gum, chunks of hard raw fruit/vegetables — always state how to cut (grapes and hot dogs LENGTHWISE into quarters).
- Cow milk as the main drink only after 12 months; full-fat from 1–2 years.
- NO added salt and sugar under 12 months; minimal until age 2.
- Caffeine and energy drinks: forbidden for all children.
- Alcohol and unpasteurized products (cheese, milk, juices): forbidden.
- Whole eggs/fish/peanut: allowed from 6 months as careful allergen introduction (one at a time, watch for reactions) — mark as "caution" with an explanation, not "unsafe".
- If the photo shows a LABEL, read the ingredient list and check every questionable ingredient (sweeteners, caffeine, allergens, salt/sugar percentage).
- If the photo does not show enough, say so in the summary and ask for a photo of the label/ingredients.
- The 14 main EU allergens: gluten, crustaceans, eggs, fish, peanuts, soy, milk, tree nuts, celery, mustard, sesame, sulphur dioxide, lupin, molluscs.
- Remind that for a child's known allergies the pediatrician decides.

FINAL LANGUAGE CHECK: before answering, re-read every text value — each one must be 100% in ${language}. If any value is in another language, translate it before returning the JSON.`;
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
      max_tokens: 3000,
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
  parsed._v = 3;
  parsed._provider = p.name;
  parsed._model = model;
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Foto provera hrane (mali obim): Gemini prvi — najprecizniji besplatni
  // vision model i najbolji jezik; NVIDIA/OpenRouter su rezerva.
  let active = PROVIDERS.filter((p) => p.key);
  active = [...active.filter((p) => p.name === 'gemini'), ...active.filter((p) => p.name !== 'gemini')];
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
    if (isAsleep(provider.name)) continue;
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
