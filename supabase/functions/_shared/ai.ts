/**
 * Jedan lanac provajdera i jedna jezička pravila — za sve funkcije SafeNest-a.
 *
 * Ovo postoji zbog greške koja se ponovila tri puta. Lanac je bio prepisan u
 * svakoj funkciji posebno, pa je popravka na jednom mestu ostavljala druga dva
 * pokvarena: analiza opasnosti je bila sređena, a skener hrane i glasovni
 * pomoćnik su i dalje prvo zvali model koji na srpskom piše besmislice.
 * Roditelj to vidi kao „aplikacija je nepovezana" — i u pravu je.
 *
 * Sada je izvor jedan. Ko menja redosled ili jezička pravila, menja ih ovde i
 * to važi svuda.
 */

export interface Provider {
  name: string;
  key: string | undefined;
  url: string;
  models: string[];
  extraHeaders?: Record<string, string>;
  extraBody?: Record<string, unknown>;
}

/**
 * Redosled je IZMEREN, ne procenjen. Stanje na dan pisanja, na pravoj
 * fotografiji kuhinje (1568 px, pun prompt):
 *
 *   cerebras    gemma-4-31b        1,3 s   radi
 *   cerebras-2  isti servis, drugi ključ (zasebna dnevna kvota)
 *   openrouter  gemma-4-26b:free  29,4 s   radi, rezerva
 *   lovable     gemini-2.5-flash     403   nema kredita, čeka dopunu
 *   gemini      gemini-2.5-flash     429   nema kredita, čeka dopunu
 *   nvidia      nemotron           uvek odgovori, ali piše loš srpski
 *
 * Gemma je jedina od besplatnih koja piše pristojan srpski, a preko Cerebrasa
 * stiže dvadeset dva puta brže nego preko OpenRoutera. Zato je prva.
 */
export function providers(): Provider[] {
  return [
    {
      name: 'cerebras',
      key: Deno.env.get('CEREBRAS_API_KEY'),
      url: 'https://api.cerebras.ai/v1/chat/completions',
      models: ['gemma-4-31b'],
    },
    {
      // Ključ stoji pod imenom za OpenAI, ali počinje sa `csk-` i pripada
      // Cerebrasu. Nije vredno seliti tajnu, vredno je iskoristiti je kao
      // zasebnu dnevnu kvotu.
      name: 'cerebras-2',
      key: Deno.env.get('OPENAI_API_KEY'),
      url: 'https://api.cerebras.ai/v1/chat/completions',
      models: ['gemma-4-31b'],
    },
    {
      name: 'openrouter',
      key: Deno.env.get('OPENROUTER_API_KEY'),
      url: 'https://openrouter.ai/api/v1/chat/completions',
      models: (Deno.env.get('FREE_MODELS') ??
        'google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,nvidia/nemotron-nano-12b-v2-vl:free'
      ).split(',').map((m) => m.trim()).filter(Boolean),
      extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SafeNest AI' },
    },
    {
      name: 'lovable',
      key: Deno.env.get('LOVABLE_API_KEY'),
      url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
      models: ['google/gemini-2.5-flash'],
    },
    {
      name: 'gemini',
      key: Deno.env.get('GEMINI_API_KEY'),
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      models: ['gemini-2.5-flash', 'gemini-2.0-flash'],
    },
    {
      name: 'nvidia',
      key: Deno.env.get('NVIDIA_NIM_API_KEY'),
      url: 'https://integrate.api.nvidia.com/v1/chat/completions',
      models: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'],
      // Bez ovoga reasoning model „razmišlja" 40–60 s po slici.
      extraBody: { chat_template_kwargs: { enable_thinking: false } },
    },
  ];
}

/**
 * Provajder koji je rekao „nemam kvotu" ne pita se ponovo odmah.
 *
 * Ovo je bio pravi uzrok toga što aplikacija „ne vidi očiglednu opasnost":
 * četiri od pet naloga su prazna, lanac je na njima trošio preko sedamdeset
 * sekundi, a telefon odustaje posle trideset pet. Do živog se nikad nije
 * stiglo.
 */
const asleep = new Map<string, number>();
const SLEEP_MS = 10 * 60 * 1000;
const DEAD = /^(401|402|403|404|429)\b/;

export const isAsleep = (name: string) => (asleep.get(name) ?? 0) > Date.now();

/** Vraća `true` kad je razlog trajan, pa nema smisla probati drugi model. */
export function noteFailure(name: string, why: string): boolean {
  const code = why.match(/upstream (\d{3})/)?.[1];
  if (code && DEAD.test(code)) {
    asleep.set(name, Date.now() + SLEEP_MS);
    return true;
  }
  return false;
}

/** Jedan pokušaj ne sme da pojede ceo budžet telefona. Gemmi treba 16–20 s. */
export const TRY_MS = 26000;

/**
 * Jezik i imenovanje — pravila koja važe za SVAKI tekst koji roditelj čita.
 *
 * Loši primeri su stvarni izlazi iz ranijih prolaza. Manji modeli mnogo bolje
 * uče iz onoga što NE SME nego iz opšteg zahteva „piši pravilno".
 */
export function languageRules(language: string): string {
  return `OUTPUT LANGUAGE: ${language}. Every human-readable value MUST be written entirely in ${language}. NEVER mix languages in one response. If your source knowledge is in another language, translate it.

VOCABULARY: natural, correct, everyday words a native ${language} speaker uses, with correct grammar in every sentence. NEVER invent words, never transliterate, never use made-up terms. If you do not know the exact word, use a simple common description. For Serbian: standard ekavian ("sto" not "stol", "sveća", "utičnica"); write simply, like a children's doctor talking to a parent.

NAMING — this is where models fail most often. A name is the ordinary word a parent would say out loud: 1-3 words, singular unless there really are several. Not a technical term, not a description of a surface, not a word borrowed from English.
Real bad outputs from earlier runs — never produce anything like them:
  "Reljefi šporeta" -> correct: "Ringle"
  "Vruća posuđa"    -> correct: "Vreo lonac"   (agreement, singular)
  "Mala dete"       -> correct: "Malo dete"    (agreement)
  "dizanje"         -> a verb is never an object name
  "Ruke posuđa"     -> correct: "Ručke lonca"
Before you output a name, re-read it: would a parent actually say this out loud? If not, use the simplest common word instead.

CERTAINTY: report ONLY what you can clearly see and confidently identify. NEVER invent objects or details. A shorter accurate answer always beats a longer invented one.`;
}
