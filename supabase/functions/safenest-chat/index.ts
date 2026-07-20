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

interface Provider {
  name: string;
  key: string | undefined;
  url: string;
  models: string[];
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

const PROVIDERS: Provider[] = [
  {
    name: 'openrouter',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['nvidia/nemotron-3-nano-30b-a3b:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-31b-it:free'],
    extraHeaders: { 'HTTP-Referer': 'https://omnimeeting.app', 'X-Title': 'SafeNest AI' },
  },
  {
    name: 'nvidia',
    key: Deno.env.get('NVIDIA_NIM_API_KEY'),
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'],
    // Bez reasoning-a: glasovni odgovor mora da stigne za par sekundi
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
  {
    name: 'groq',
    key: Deno.env.get('GROQ_API_KEY'),
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile'],
  },
  {
    name: 'gemini',
    key: Deno.env.get('GEMINI_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.5-flash'],
  },
];

const AGE_SR: Record<string, string> = {
  '0-6m': '0–6 meseci', '6-12m': '6–12 meseci (puzanje)', '1-2y': '1–2 godine (prohodavanje)',
  '2-4y': '2–4 godine (penjanje)', '4-7y': '4–7 godina', '7y+': '7+ godina',
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

  const age = AGE_SR[body?.ageGroup] ?? body?.ageGroup ?? 'malo dete';
  const language = String(body?.language ?? 'Serbian').slice(0, 30);
  const hazardCtx = Array.isArray(body?.hazards) && body.hazards.length > 0
    ? `Na poslednjem skeniranju prostora uočeno je: ${body.hazards
        .slice(0, 12)
        .map((h: any) => `${h.label} (${h.severity})`)
        .join(', ')}.`
    : 'Nema prethodnog skeniranja.';

  const system = `OUTPUT LANGUAGE: ${language}. Respond ENTIRELY in ${language} — never mix languages.

Ti si SafeNest glasovni asistent — ekspert za bezbednost dece u domu (childproofing, pedijatrijska prevencija povreda; SZO/CDC/EU izvori).
Kontekst: dete uzrasta ${age}. ${hazardCtx}
Pravila odgovora:
- RESPOND ENTIRELY IN ${language} — this is mandatory. Warm and calm tone, no panic.
- KRATKO: 2-4 rečenice, jer se odgovor izgovara naglas.
- Uvek daj konkretan, odmah izvodljiv savet.
- Statistike samo stvarne, sa izvorom; nikad izmišljene brojeve.
- Podseti (samo kad je relevantno) da aplikacija ne zamenjuje nadzor odrasle osobe.`;

  const errors: string[] = [];
  for (const p of PROVIDERS.filter((x) => x.key)) {
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
