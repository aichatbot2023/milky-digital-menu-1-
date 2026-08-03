// Interni tekstualni endpoint — isti besplatni lanac provajdera kao ostatak
// sistema, samo bez slike. Koristi ga `tools/safenest-translate.py` da
// prevede interfejs; nijedna stranica ga ne poziva.
//
// Redosled je ovde drugačiji nego u analizi opasnosti, i to iz merenja:
// Nemotron je odličan za slike, ali na bengalskom i svahiliju vraća
// besmislice — „Critical" mu je ispalo „Kifedha" (finansijski). Gemini
// preko Lovable prolaza daje tačan tekst, pa ide prvi. Nemotron je ovde
// poslednji, taman da nešto stigne kad sve drugo padne.
// Zaštićeno ADMIN_KEY-em.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN = Deno.env.get('ADMIN_KEY') ?? '';

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
    // Najbolji od svih koje imamo na retkim jezicima — zato prvi.
    name: 'lovable',
    key: Deno.env.get('LOVABLE_API_KEY'),
    url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    models: ['google/gemini-2.5-flash'],
  },
  {
    name: 'gemini',
    key: Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_AI_STUDIO_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.5-flash'],
  },
  {
    name: 'openrouter',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['google/gemma-4-31b-it:free', 'nvidia/nemotron-nano-12b-v2-vl:free'],
    extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SafeNest AI' },
  },
  {
    name: 'groq',
    key: Deno.env.get('GROQ_API_KEY'),
    // Scout je na ovom nalogu 404 — versatile je model koji zaista postoji.
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile'],
  },
  {
    name: 'nvidia',
    key: Deno.env.get('NVIDIA_NIM_API_KEY'),
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'],
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
];


const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function ask(p: Provider, model: string, messages: unknown[], temperature: number, maxTokens: number) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 170000);
  try {
    const r = await fetch(p.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.key}`,
        'Content-Type': 'application/json',
        ...(p.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(p.extraBody ?? {}),
      }),
      signal: ctl.signal,
    });
    const text = await r.text();
    if (!r.ok) return { error: `${p.name}/${model} ${r.status}: ${text.slice(0, 200)}` };
    const data = JSON.parse(text);
    const out = data?.choices?.[0]?.message?.content;
    return typeof out === 'string' && out.trim()
      ? { text: out, via: `${p.name}/${model}` }
      : { error: `${p.name}/${model}: prazan odgovor` };
  } catch (e) {
    return { error: `${p.name}/${model}: ${String(e).slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  let body: any = {};
  try {
    body = await req.json();
  } catch { /* prazno telo pada na proveru ispod */ }

  if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages?.length) return json({ error: 'messages je obavezan' }, 400);

  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.2;
  const maxTokens = Number(body.max_tokens) || 4000;
  const only = typeof body.provider === 'string' ? body.provider : '';

  const tried: string[] = [];
  for (const p of PROVIDERS) {
    if (!p.key || (only && p.name !== only)) continue;
    for (const model of p.models) {
      const r = await ask(p, model, messages, temperature, maxTokens);
      if ('text' in r) return json({ text: r.text, via: r.via });
      tried.push(r.error!);
    }
  }
  return json({ error: 'nijedan provajder nije odgovorio', tried }, 502);
});
