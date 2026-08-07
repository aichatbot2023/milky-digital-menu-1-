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
  /**
   * Modeli za poslove BEZ slike (sud o celoj prostoriji).
   *
   * Postoji zato što kod NVIDIA-e to nisu isti modeli. Njihovi vizuelni
   * modeli na tekstualnom poslu troše budžet i vraćaju besmislice, a
   * njihovi tekstualni modeli su na istom nalogu i besplatni i dobri.
   * Kad nije zadato, važi `models`.
   */
  textModels?: string[];
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
 *   nvidia      llama-3.2-90b     150 s   tačan, ali daleko preko naših 30 s
 *                                         — za gledanje poslednja rezerva,
 *                                         za sud o prostoriji prvorazredan
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
      /**
       * NEMOTRON JE IZBAČEN, i to na osnovu merenja a ne ukusa.
       *
       * Na pitanje „zašto je otvorena utičnica opasna za dete?" odgovorio je:
       * „Open prisons are dangerous for children because they lack strict
       * security, allowing kids to escape". Dakle nije samo pisao loš srpski —
       * pročitao je „otvorena utičnica" kao „otvoreni zatvor". Odatle i one
       * izmišljene reči koje smo ranije videli na pravim fotografijama
       * („Gašalica", „Plovacka kola"): model taj jezik ne razume, pa ga
       * pogađa.
       *
       * PRETHODNO MERENJE JE BILO POGREŠNO POSTAVLJENO, pa ga ovde ispravljam.
       *
       * Merio sam kratko pitanje („zašto je otvorena utičnica opasna?") i
       * dobio: 11b 2,2 s tačan srpski. Na osnovu toga je 11b bio prvi. Ali
       * aplikacija ne šalje kratko pitanje — šalje 14 kB prompta, sliku od
       * 1024 px i traži 4000 tokena JSON-a. Na TOM poslu, izmereno:
       *
       *   llama-3.2-11b-vision    85 s  vrti se u krug, JSON se preseče
       *                                 (finish_reason "length") — ništa
       *   llama-3.2-90b-vision   150 s  ispravan JSON, besprekoran srpski
       *   nemotron-nano-12b-vl    72 s  raspad: „Tajisa može da se upakuje
       *                                 i de früheren stehrop kampe"
       *   nemotron-nano-vl-8b     23 s  ispravan JSON, ali ista opasnost
       *                                 dvaput i „može uđeti", „sloms"
       *
       * Prazan poziv od 16 tokena razdvaja dva uzroka: 11b odgovori za 0,5 s
       * (znači red nije kriv, model ne ume da stane), a 90b i za 16 tokena
       * čeka 18–90 s (znači red JESTE kriv). Nijedan ne staje u naših 30 s.
       *
       * Zato NVIDIA za GLEDANJE ostaje samo kao poslednja rezerva, i to sa
       * jedinim modelom koji bar piše ispravan srpski. 11b je izbačen: model
       * koji pouzdano potroši ceo budžet i ne vrati ništa je gori od
       * provajdera koji odmah kaže da ne može.
       */
      models: [
        'meta/llama-3.2-90b-vision-instruct',
      ],
      /**
       * Sud o prostoriji nema sliku, pa ga ne rade oči nego pamet — i tu je
       * isti besplatni nalog odjednom jak. Izmereno na pravom `action: 'room'`
       * promptu (tri ugla, devet nalaza, srpski):
       *
       *   gpt-oss-20b              20 s  ispravan JSON, prirodan srpski
       *                                  („Dragi roditelju, vaša kuhinja…")
       *   nemotron-super-49b-v1.5  23 s  ispravan JSON, ali „djeteta",
       *                                  „poduzeti" — ijekavica, pa druga
       *   deepseek-v4-flash        21 s  IZBAČEN: kuhinji sa otrovom, vrelom
       *                                  ringlom i golom utičnicom dao je
       *                                  ocenu 85/100. Ostali su dali 20–35.
       *                                  Pogrešna ocena je gora od nikakve.
       *   llama-3.3-70b           162 s  tačan, ali van svake upotrebe
       *   gpt-oss-120b             48 s  najbolji srpski, ali i prazan poziv
       *                                  čeka 36–86 s — red je prezauzet
       */
      textModels: [
        'openai/gpt-oss-20b',
        'nvidia/llama-3.3-nemotron-super-49b-v1.5',
      ],
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
 * ODGOVOR NA POGREŠNOM JEZIKU JE NEUSPEO ODGOVOR.
 *
 * Uputstvo o jeziku stoji na vrhu svakog prompta, izričito i ponovljeno — i
 * slabiji modeli ga svejedno preskoče. Izmereno na pravoj fotografiji: kad
 * lanac padne na nemotron, vrati uredan JSON i u njemu rečenicu „bright and
 * modern but hides several dangers for a 1-2-year-old". Roditelj koji je
 * izabrao srpski dobija izveštaj o svom stanu na engleskom.
 *
 * Do sada je takav odgovor prolazio kao ispravan, jer je JSON bio validan.
 * Provera oblika nije provera sadržaja. Ovde se meri jedino što se pouzdano
 * meri bez još jednog poziva modelu: gustina engleskih službenih reči. Kad
 * je tražen jezik bilo koji osim engleskog, engleski odgovor se odbacuje i
 * pita se sledeći provajder.
 *
 * Namerno se NE pokušava prepoznavanje svih jezika — greška koja se dešava
 * je uvek ista: model se vrati na engleski. Provera koja hvata tu jednu
 * grešku pouzdano vredi više od pametne koja se koleba na četrdeset jezika.
 */
const EN_WORDS =
  /\b(the|and|is|are|was|were|of|with|for|from|that|this|these|those|can|could|should|would|keep|away|child|children|danger|dangerous|risk|make|sure|out|reach)\b/gi;

export function wrongLanguage(text: string, language: string): boolean {
  if (/english/i.test(language)) return false;
  const words = text.trim().split(/\s+/).length;
  if (words < 12) return false; // prekratko da bi se sudilo
  const hits = (text.match(EN_WORDS) ?? []).length;
  return hits / words > 0.12;
}

/**
 * Ukupan budžet vremena za JEDAN poziv funkcije.
 *
 * Lanac ima šest provajdera; uz 26 s po svakome to je 156 s u jednom pozivu.
 * Supabase edge funkcija toliko ne izdrži i ruši se sa WORKER_RESOURCE_LIMIT
 * — a to je gore od poštenog neuspeha, jer klijent dobije šifru greške
 * umesto poruke i ne zna da pokuša ponovo. Kad budžet istekne, prestaje se
 * sa pokušajima i vraća se uredan odgovor.
 *
 * Provajder koji je pao pamti se kao „uspavan" (vidi `noteFailure`), pa
 * sledeći pokušaj klijenta kreće od drugog i ne ponavlja isti zid.
 */
export const BUDGET_MS = 95000;


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
