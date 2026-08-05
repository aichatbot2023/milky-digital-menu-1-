import { providers, languageRules, isAsleep, noteFailure, TRY_MS, type Provider } from '../_shared/ai.ts';
/**
 * safenest-chat — glasovni/tekstualni asistent za bezbednost dece.
 * Pitanje roditelja + kontekst skena (prostor, uzrast, nađene opasnosti)
 * → kratak odgovor na srpskom (za izgovaranje TTS-om na telefonu).
 *
 * Isti freeLlmRouter lanac kao analyze-hazards; Nemotron (tekst) je primaran.
 * Body: { question, roomType?, ageGroup?, hazards?: [{label, severity}] }
 * Vraća: { answer, _provider, _model }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Redosled po KVALITETU JEZIKA: mali :free modeli (nano-30b) pišu loš
// srpski/nemački, pa idu poslednji. NVIDIA NIM Nemotron je primaran (dobar
// višejezični izlaz, brz za tekst), zatim veći free modeli.
const PROVIDERS: Provider[] = providers();

// Prompt je ceo na engleskom: slabiji modeli odgovaraju na jeziku prompta,
// pa engleski prompt + "OUTPUT LANGUAGE: X" daje pouzdan izlaz na 42 jezika.
const AGE_EN: Record<string, string> = {
  '0-6m': '0–6 months', '6-12m': '6–12 months (crawling)', '1-2y': '1–2 years (learning to walk)',
  '2-4y': '2–4 years (climbing)', '4-7y': '4–7 years', '7y+': '7+ years',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const question = String(body?.question ?? '').slice(0, 500).trim();
  if (!question) return json({ error: 'Missing question' }, 400);

  const age = AGE_EN[body?.ageGroup] ?? body?.ageGroup ?? 'a small child';
  const language = String(body?.language ?? 'Serbian').slice(0, 30);
  const hazardCtx = Array.isArray(body?.hazards) && body.hazards.length > 0
    ? `The last room scan detected: ${body.hazards
        .slice(0, 12)
        .map((h: any) => `${h.label} (${h.severity})`)
        .join(', ')}.`
    : 'No previous scan.';

  const system = `OUTPUT LANGUAGE: ${language}. Respond ENTIRELY in ${language} — never mix languages. If any source knowledge is in another language, translate it into ${language}.

${languageRules(language)}

You are the SafeNest voice assistant — an expert in child safety at home (childproofing, pediatric injury prevention; WHO/CDC/EU sources).
Context: child aged ${age}. ${hazardCtx}
Answer rules:
- RESPOND ENTIRELY IN ${language} — this is mandatory. Warm and calm tone, no panic.
- SHORT: 2-4 sentences, because the answer is spoken aloud (TTS).
- Always give one concrete, immediately actionable tip.
- Only real statistics with a source; never invented numbers.
- Remind (only when relevant) that the app does not replace adult supervision.`;

  const errors: string[] = [];
  for (const p of PROVIDERS.filter((x) => x.key)) {
    // Mrtav nalog se ne pita ponovo; bez ovoga lanac potroši ceo
    // budžet telefona na provajdere koji nemaju kvotu.
    if (isAsleep(p.name)) continue;
    for (const model of p.models) {
      try {
        const res = await fetch(p.url, {
          method: 'POST',
          signal: AbortSignal.timeout(25000),
          headers: {
            'Authorization': `Bearer ${p.key}`,
            'Content-Type': 'application/json',
            ...(p.extraHeaders ?? {}),
          },
          body: JSON.stringify({
            ...(p.extraBody ?? {}),
            ...(p.name === 'openrouter' && model.includes('nemotron')
              ? { reasoning: { enabled: false } }
              : {}),
            model,
            max_tokens: 400,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: question },
            ],
          }),
        });
        if (!res.ok) throw new Error(`${p.name}/${model}: ${res.status}`);
        const data = await res.json();
        const answer: string | undefined = data.choices?.[0]?.message?.content?.trim();
        if (!answer) throw new Error(`${p.name}/${model}: empty`);
        return json({ answer, _provider: p.name, _model: model });
      } catch (e: any) {
        errors.push(e?.message ?? String(e));
      }
    }
  }
  return json({ error: `Asistent trenutno nije dostupan. (${errors[errors.length - 1] ?? 'nema provajdera'})` }, 502);
});
