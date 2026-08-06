import {
  BUDGET_MS,
  TRY_MS,
  isAsleep,
  noteFailure,
  providers,
  type Provider,
  wrongLanguage,
} from '../_shared/ai.ts';
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

const ADMIN = Deno.env.get('ADMIN_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lanac provajdera, poređan po IZMERENOM kvalitetu na retkim jezicima.
//
// Ovo je bilo naopako i skupo se videlo. NVIDIA Nemotron je stajao prvi
// „zbog brzine", pa je roditelj na srpskom dobijao ovakav nalaz:
//
//   „Dizanje je niskom dužine, ali je približno na nivelu glave odrasle
//    djece i može se lagno prevladati... rupe od stena ili šprkota."
//
// Naziv opasnosti „dizanje", koraci u infinitivu, izmišljene reči. Brz
// odgovor koji ništa ne znači nije brz odgovor nego pokvaren proizvod.
//
// Isti redosled je već izmeren u `free-llm` i tamo primenjen; ovde je bio
// zaboravljen. Lovable (Gemini 2.5 Flash) najbolje piše retke jezike, pa
// Gemini direktno, pa OpenRouter; NVIDIA ostaje POSLEDNJA — bolje njen loš
// srpski nego prazan ekran, ali samo kad nema nikog drugog.
//
// Svi moraju da vide sliku: lanac je multimodalan, tekstualni model ovde ne
// može da uskoči ni kao ispomoć.
const PROVIDERS: Provider[] = providers();

/**
 * Provajder koji je upravo rekao „nemam kvotu" ne pitamo ponovo odmah.
 *
 * Ovo je bio pravi uzrok toga što aplikacija „ne vidi očiglednu opasnost":
 * četiri od pet provajdera su mrtva (potrošeni krediti), lanac je na njima
 * trošio preko sedamdeset sekundi, a telefon odustaje posle trideset pet.
 * Do živog provajdera se prosto nikad nije stiglo, pa je roditelj ostajao na
 * onome što je telefon sam video — saksija i tri činije u kuhinji sa vrelim
 * šporetom.
 *
 * Odgovori koji znače „nema kvote" ili „nema modela" ne menjaju se za minut,
 * pa se pamte i preskaču. Sve ostalo je prolazno i ne pamti se.
 */

/**
 * Jedan pokušaj ne sme da pojede ceo budžet telefona, ali ni da ubije onoga
 * ko radi. Izmereno: Gemmi na kadar od 768 px treba oko 16–20 s. Prvi put
 * sam ovde stavio 12 s po tome koliko je provajder odgovarao na sličicu od
 * osam piksela — i time pogasio jedina dva koja rade.
 */

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

/**
 * Zatvoren rečnik rešenja.
 *
 * Model je ranije sam pisao ime proizvoda („stovetop knob covers"), a mi smo
 * ga posle upoređivali sa katalogom po zajedničkim rečima. Tako su poklopci
 * za utičnice postali prvo rešenje za vreo šporet — jer im se poklopila reč
 * „covers". Slobodan tekst se ne da pouzdano spojiti sa policom.
 *
 * Zato model bira KLJUČ sa spiska. Spisak je kratak i pokriva ono što se u
 * domu sa detetom zaista kupuje; kad ništa ne odgovara, ključ je `none` i
 * roditelj dobija samo savet, bez proizvoda.
 */
const SOLUTION_KEYS = [
  'socket_cover',        // otvorena utičnica
  'corner_guard',        // oštra ivica stola, police, radne ploče
  'stair_gate',          // stepenice, prolaz, vrata sobe
  'cabinet_lock',        // ormarić, vitrina
  'drawer_lock',         // fioka
  'oven_lock',           // vrata rerne
  'hob_guard',           // ringle, šporet, vrelo posuđe
  'anti_tip_strap',      // komoda, polica, TV koji se prevrće
  'blind_cord_winder',   // kabl roletne ili zavese
  'medicine_box',        // lekovi, vitamini
  'chemical_lock',       // sredstva za čišćenje, deterdžent, kapsule
  'bath_mat',            // klizava kada ili tuš
  'toilet_lock',         // WC šolja
  'spill_proof_cup',     // vrelo piće nadohvat
  'door_stopper',        // vrata koja prikleštaju prste
  'window_lock',         // prozor, balkonska vrata
  'cord_cover',          // slobodni kablovi, produžni
  'fireplace_guard',     // kamin, peć, radijator
  'knife_lock',          // noževi, makaze, oštri pribor
  'small_parts_bin',     // sitni delovi, baterije, magneti
  'furniture_edge_film', // staklo, ogledalo, staklena vrata
  'none',                // nema proizvoda — samo postupak
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * Spoji nalaze koji pokazuju na ISTO mesto iste vrste.
 *
 * Preklapanje se deli MANJOM površinom, ne unijom: lonac unutar zone šporeta
 * jeste isto mesto iako je mnogo manji, a unija bi to sakrila.
 *
 * Stoji na nivou modula (a ne unutar poziva modela) zato što se isti postupak
 * primenjuje i posle „drugog pogleda" — inače bi drugi prolaz vratio šporet
 * koji je prvi već našao, i roditelj bi ga video dvaput.
 */
function mergeTwins(hazards: any[]): any[] {
  const WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const overlap = (a: any, b: any) => {
    const x1 = Math.max(a.box.x, b.box.x);
    const y1 = Math.max(a.box.y, b.box.y);
    const x2 = Math.min(a.box.x + a.box.w, b.box.x + b.box.w);
    const y2 = Math.min(a.box.y + a.box.h, b.box.y + b.box.h);
    const hit = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    if (hit <= 0) return 0;
    return hit / Math.min(a.box.w * a.box.h, b.box.w * b.box.h);
  };
  const kept: any[] = [];
  for (const h of hazards) {
    const twin = kept.find((k) => k.category === h.category && overlap(k, h) > 0.5);
    if (!twin) { kept.push(h); continue; }
    if ((WEIGHT[h.severity] ?? 0) > (WEIGHT[twin.severity] ?? 0)) {
      twin.label = h.label;
      twin.severity = h.severity;
      twin.why = h.why;
      twin.box = h.box;
      // Sigurnost prati naziv: ako ozbiljnije viđenje zna šta gleda, nalaz
      // prestaje da bude nagađanje.
      twin.uncertain = h.uncertain;
    }
    if (!twin.solution && h.solution) twin.solution = h.solution;
    twin.facts = [...new Set([...(twin.facts ?? []), ...(h.facts ?? [])])].slice(0, 4);
    twin.steps = [...new Set([...(twin.steps ?? []), ...(h.steps ?? [])])].slice(0, 3);
  }
  return kept;
}

/**
 * DRUGI POGLED — pitanje „šta si propustio?", postavljeno istom modelu.
 *
 * Merenje na fotografiji cele kuhinje: model prijavi pet opasnosti i stane.
 * Nije da ih nema više — soba u kojoj živi dvogodišnjak ih ima znatno više —
 * nego što model, kad jednom sastavi spisak, smatra posao završenim. To se
 * ne popravlja strožim uputstvom u prvom prolazu; probano je, i dalje staje.
 *
 * Popravlja se PITANJEM. Kad mu se kaže šta je već našao i traži se samo
 * ono što nije, model gleda na druga mesta umesto da prepisuje svoj spisak.
 * Košta jedan poziv, a pozivi su besplatni — pa se plaća sekundama, i to
 * samo kod fotografije, gde roditelj ionako svesno čeka nalaz. Uživo režim
 * ovo ne radi, tamo je brzina važnija.
 *
 * Ako drugi pogled padne iz bilo kog razloga, vraća se prvi nalaz nepromenjen.
 * Ovo je dodatak, nikad uslov.
 */
async function secondLook(
  p: Provider, model: string, image: string, language: string,
  first: any, roomType: string, ageGroup: string,
): Promise<any> {
  const already = (first.hazards ?? [])
    .map((h: any) => `- ${h.label}`).join('\n') || '- (ništa)';
  const room = ROOM_EN[roomType] ?? 'room';
  const age = AGE_EN[ageGroup] ?? ageGroup;
  const prompt = `OUTPUT LANGUAGE: ${language}. Write every human-readable value entirely in ${language}.

You have already examined this photo of a "${room}" for a child aged ${age} and reported these hazards:
${already}

Those are done. Do NOT repeat any of them, and do not report the same physical object again under a different name.

Now LOOK AGAIN, at the parts of the photo you did not examine the first time. Work through this list and check each one against the photo:
floor level and anything a crawling child reaches · low drawers and cabinet doors · electrical sockets, cables, extension leads, chargers · appliance cords that hang down (kettle, toaster, iron) · table and worktop edges and corners · tablecloths or runners that can be pulled down · chairs, stools or boxes a child can climb · heat: hob, oven door, radiator, hot drinks · water: sink, bucket, bath, pet bowl · cleaning products, medicines, cosmetics, alcohol · bins · plastic bags, cling film, foil · small swallowable items (coins, batteries, magnets, caps, buttons, nuts) · blind and curtain cords · doors and hinges that trap fingers · windows and balconies · houseplants · anything glass or ceramic within reach · pet food or litter.

Report ONLY hazards that are genuinely VISIBLE in this photo and are NOT already in the list above. Never invent anything. If you honestly find nothing new, return an empty array — but check the whole list first.

Return ONLY valid JSON, same shape as before:
{"hazards":[{"label":"...","category":"fall|choking|poisoning|burn|electric|cutting|drowning|crush|strangulation|other","severity":"critical|high|medium|low","box":{"x":0,"y":0,"w":0.1,"h":0.1},"why":"...","facts":["..."],"steps":["..."],"certain":true,"reach":5,"size_cm":10,"solution":"${SOLUTION_KEYS.join(' | ')}","stats":"...","fix":"..."}]}`;

  const more = await callVision(p, model, image, prompt, language);
  const extra = Array.isArray(more?.hazards) ? more.hazards : [];
  if (!extra.length) return first;
  return {
    ...first,
    hazards: mergeTwins([...(first.hazards ?? []), ...extra]),
    _found: (first._found ?? 0) + (more._found ?? extra.length),
    _second: extra.length,
  };
}

/**
 * PROCENA CELE PROSTORIJE IZ VIŠE UGLOVA.
 *
 * Jedan kadar je jedan zid. Roditelj koji slika kuhinju sa vrata ne vidi ono
 * iza sebe, a dete se kreće po celoj prostoriji — pa opasnost nije samo
 * predmet nego i PUT do njega: stolica uz radnu ploču, ploča uz šporet,
 * šporet uz vrata terase. Takav lanac se iz jedne slike ne vidi ni u
 * principu, ma koliko model bio dobar.
 *
 * Zato se pojedinačni nalazi iz više uglova ovde spajaju u jedan sud o
 * prostoru. Model NE dobija slike ponovo — dobija spisak već potvrđenih
 * nalaza sa svakog ugla i pitanje koje se na jednoj slici ne može postaviti:
 * šta ovaj raspored znači za dete koje po njemu puzi ili hoda.
 *
 * Košta jedan tekstualni poziv, bez slika, pa je i brz i jeftin.
 */
async function roomVerdict(
  p: Provider, model: string, language: string,
  angles: { hazards: any[] }[], roomType: string, ageGroup: string,
): Promise<any> {
  const room = ROOM_EN[roomType] ?? 'room';
  const age = AGE_EN[ageGroup] ?? ageGroup;
  const list = angles.map((a, i) =>
    `Angle ${i + 1}: ` + (a.hazards ?? []).map((h: any) =>
      `${h.label} (${h.category}, ${h.severity}, reach ${h.reach ?? '?'}/10)`).join('; ')
  ).join('\n');

  const prompt = `OUTPUT LANGUAGE: ${language}. Write every value entirely in ${language}.

A parent photographed one "${room}" from ${angles.length} different angles. A child aged ${age} lives here. These are the confirmed findings per angle:

${list}

You are not looking at photographs now. You are looking at ONE ROOM described from several sides. Answer what a single photo can never show:

1. ROUTES. Which findings combine into a path the child can actually take? A chair next to the worktop next to the hob is a climbing route to boiling water — three harmless-looking items making one serious danger. Name the chain explicitly.
2. WHAT REPEATS. A hazard seen from several angles is not several problems; it is one problem the parent walks past all day.
3. WHAT IS MISSING. Given this room type and this age, which check does the parent still owe — something that is rarely visible in a photo (window restrictors, water temperature, what is inside the low cupboards, furniture anchored to the wall).
4. WHERE TO START. One place, not a list. The one thing that would most reduce the risk in this room today.

Return ONLY valid JSON:
{
  "room_score": 0-100 (whole room, for this age),
  "verdict": "3-4 sentences in ${language}, calm, addressed to the parent",
  "routes": [{"chain": "chair → worktop → hob, in ${language}", "why": "one sentence in ${language}", "severity": "critical|high|medium|low"}],
  "repeated": ["names of hazards seen from several angles, in ${language}"],
  "unchecked": ["2-4 checks the parent should still do, imperative, max 8 words each, in ${language}"],
  "start_here": "one sentence in ${language}"
}`;

  const out = await callText(p, model, prompt, language);
  return out;
}

/**
 * Isti posao, drugo biće — analiza prostora za LJUBIMCA.
 *
 * Ne prevodi se dečji prompt. Ljubimac se u istoj sobi ponaša drugačije, pa
 * su i opasnosti druge: pas jede sa stola dok niko ne gleda, mačka se penje
 * svuda i skače kroz otvoren prozor, zec grize kablove, ptica strada od
 * isparenja iz kuhinje. Pravilo o dohvatu, koje je kod deteta pola posla,
 * za mačku prosto ne važi.
 */
const PET_EN: Record<string, string> = {
  'dog-small': 'a small dog', 'dog-large': 'a large dog', cat: 'a cat',
  rabbit: 'a rabbit', bird: 'a pet bird', rodent: 'a small rodent (hamster, guinea pig)',
};

function buildPetPrompt(roomType: string, petKind: string, language = 'Serbian', live = false): string {
  const room = ROOM_EN[roomType] ?? 'room';
  const pet = PET_EN[petKind] ?? 'a pet';
  const liveRules = live
    ? `\n\nLIVE CAMERA MODE — a single frame from a video feed, possibly soft or partial. That lowers your CONFIDENCE, not the number of hazards. Report what you see and mark shaky findings with "certain": false. Do not report the person holding the camera.`
    : '';

  return `${languageRules(language)}

You are a veterinary expert in household hazards for companion animals, with the knowledge of ASPCA Animal Poison Control, WSAVA and PDSA.

Analyze this photo of a "${room}" and identify EVERY hazard for ${pet} living in this home.

THINK LIKE THE ANIMAL, NOT LIKE A PERSON. This is where analyses go wrong:
- A cat reaches EVERYTHING: worktops, the fridge top, wardrobes, open windows. Height protects nothing. Never dismiss a hazard because it is "up high".
- A dog eats what it finds while nobody watches, and reaches further up than owners expect.
- Rabbits and rodents gnaw anything cable-shaped; a live cable is a lethal hazard, not an untidy one.
- Birds are killed by fumes a human does not notice: overheated non-stick pans, aerosols, scented candles.

WHAT MATTERS MOST, in this order:
1. POISONS. Lilies are lethal to cats (kidney failure from pollen alone). Also toxic: dieffenbachia, philodendron, dracaena, poinsettia, sago palm. Chocolate, xylitol, grapes, raisins, onion, garlic, alcohol, macadamia. Human medicines — a single ibuprofen or paracetamol tablet can kill a cat. Antifreeze, cleaning products, essential-oil diffusers.
2. THINGS SWALLOWED. String, thread, yarn, ribbon, hair ties, dental floss — for a cat this is a linear foreign body and emergency surgery, and it never looks dangerous. Also: button batteries, coins, toy parts, bones.
3. ESCAPE AND FALLS. Unscreened open windows and balconies for cats. Stairs for long-backed dog breeds and for rabbits.
4. TRAPS. Washing machine and tumble dryer (cats sleep in them), reclining chairs, toilet bowls, tilting windows.
5. BURNS AND FIRE. Hot hobs, candles, open fires, heaters.

DO NOT report:
- the animal itself, or its own food, bed, litter tray, scratching post or carrier when they are simply present and appropriate;
- toys made for that species with no visible fault;
- furniture that is merely present.

Return ONLY valid JSON (no markdown fences):
{
  "hazards": [{
    "label": "short everyday name of the object in ${language}, 1-3 words",
    "category": "fall|choking|poisoning|burn|electric|cutting|drowning|crush|strangulation|other",
    "severity": "critical|high|medium|low",
    "box": {"x":0.1,"y":0.2,"w":0.15,"h":0.1} (tight around THIS object only, 0-1 of the whole image),
    "why": "2-3 sentences in ${language}: what happens to THIS animal, concretely",
    "facts": ["REQUIRED 2-4 items, max 6 words each, in ${language}, new information not repeated from why"],
    "steps": ["1-3 imperative actions in ${language}, max 10 words each"],
    "certain": true or false,
    "reach": 1-10 (how easily THIS species gets to it; for a cat this is almost always 8-10),
    "vet_urgent": true if this needs a vet the same day when it happens, false otherwise,
    "stats": "real veterinary fact with source (ASPCA/WSAVA/PDSA) in ${language}, never invented numbers",
    "fix": "one concrete step doable right now, in ${language}"
  }],
  "safety_score": 0-100,
  "summary": "2 sentences in ${language}, calm and practical"
}${liveRules}

BE THOROUGH. A normal living room or kitchen with a cat in it usually holds SIX OR MORE real hazards. If you found only two or three, you have not finished looking — check the plants, the cables, the windows, the worktops and what is behind the low doors.`;
}

function buildPrompt(roomType: string, ageGroup: string, childName?: string, language = 'Serbian', live = false): string {
  const room = ROOM_EN[roomType] ?? 'room';
  const age = AGE_EN[ageGroup] ?? ageGroup;
  const child = childName ? ` named ${childName}` : '';
  // Živi video: kadar je često mutan/delimičan, pa slabiji modeli izmišljaju
  // predmete. U live režimu tražimo SAMO potpuno sigurne nalaze.
  const liveRules = live
    ? `

LIVE CAMERA MODE — THIS IS A SINGLE FRAME FROM A LIVE VIDEO FEED (may be blurry or partial):
- The frame may be soft or partial. That lowers your CONFIDENCE, not the number of hazards you report. Report everything you can see, and mark the shaky ones with "certain": false.
- NEVER invent an object that is not in the frame. But "I can see it and I am not fully sure what it is" is reported with "certain": false — it is NOT dropped.
- An empty "hazards" array is correct only when the frame genuinely shows nothing hazardous.
- Do NOT report the person holding the camera, their body, clothes, or furniture that is merely present (sofa, wall art, radiator) unless it poses a concrete, visible risk.
- "label" must be 1–3 simple everyday words in ${language}; "why" must be ONE short, grammatically correct sentence. No complicated phrasing.`
    : '';
  return `OUTPUT LANGUAGE: ${language}. Every human-readable value you produce (label, why, stats, fix, summary) MUST be written entirely in ${language}. NEVER mix languages in a single response. If any source knowledge is in another language, translate it into ${language}.

VOCABULARY: use natural, correct, everyday words that a native ${language} speaker would use, with correct grammar in every sentence. NEVER invent words, never transliterate from other languages, never use made-up terms. If you do not know the exact word for an object in ${language}, use a simple common description instead. For Serbian: standard ekavian Serbian ("sto" not "stol", "sveća", "utičnica"); write simply, like a children's doctor talking to a parent.

NAMING THE OBJECT — this is where models fail most often, so read it twice.
"label" is the ordinary name a parent would say out loud, 1-3 words, singular unless there really are several. It is NOT a technical term, NOT a description of a surface, NOT a translation of an English word you happen to know.
These are real bad outputs from earlier runs — never produce anything like them:
  "Reljefi šporeta"  -> correct: "Ringle"           (the word for a cooker's hot plates)
  "Vruća posuđa"     -> correct: "Vreo lonac"        (agreement, singular)
  "Mala dete"        -> correct: "Malo dete"         (agreement)
  "dizanje"          -> a verb is never an object name
  "Ruke posuđa"      -> correct: "Ručke lonca"
Before you output each label, re-read it and ask: would a parent actually say this out loud? If not, replace it with the simplest common word.

ONE HAZARD PER OBJECT OR ZONE. Do not report the same physical thing twice under different names. A cooker with hot pots on it is ONE hazard, not "cooker" plus "pots" plus "hot plates". If two findings would point at overlapping parts of the photo, merge them into the more serious one.

CERTAINTY IS A FIELD, NOT A FILTER. Never invent an object, hazard or detail that is not visibly present — that rule is absolute. But do not stay silent about something you can actually see just because you are not certain what it is: report it and set "certain": false. Inventing and reporting-with-doubt are opposite things, and only the first is forbidden.

BE THOROUGH. Go across the whole photo systematically — floor, low furniture, worktops, table edges, sockets and cords, doors and drawers, windows and blinds, heat sources, water, bins, plants, anything small enough to swallow. A normal family kitchen or living room with a toddler in it usually holds EIGHT OR MORE real hazards. If you have found only three or four, you have not finished looking. Missing a real danger is the worst outcome this app can produce.

SCALE FIRST — ESTIMATE REAL-WORLD SIZE BEFORE JUDGING RISK:
Before you call anything a hazard, work out how BIG it really is. Compare it to reference objects in the same photo whose true size you know: a standard plug socket is ~8 cm wide, a shelf board is ~2 cm thick, a shelf compartment is ~30 cm tall, a mug ~9 cm, a door handle ~12 cm, a floor tile ~30-60 cm, a skirting board ~10 cm, an adult hand ~19 cm. Use the object's share of the frame together with those references.
- A choking hazard ONLY exists if the object (or a piece that can realistically break off it) fits inside a toddler's mouth: the longest dimension is UNDER ~4.5 cm, roughly the diameter of a toilet-paper tube. A large rubber duck, a football, a teddy bear, a full-size shoe, a book or a big toy CANNOT be swallowed — do NOT report them as choking hazards. If such an object has a small detachable part (a squeaker, an eye, a battery cover, a bell), report THAT part and say so explicitly.
- Same logic for every other category: an object that is too heavy for a child to lift is not a throwing hazard, a shelf 2 m up is not within reach, a 5 mm gap cannot trap a head.
- If an object is clearly big enough to be harmless in that category, leave it out completely rather than reporting it with low severity.
- TOYS THE CHILD IS PLAYING WITH. Building blocks, stacking cups, large beads, ride-on toys and soft toys are made for this age and are NOT hazards just for being on the floor. Report a toy ONLY if you can point at the specific reason: a piece small enough to swallow (under ~4.5 cm), a long cord or strap, a button battery, a sharp break, or a pile high enough to climb. "Toys on the floor" on its own is not a finding — say nothing rather than alarm a parent about play.
Include your estimate in "size_cm" so it can be checked.${liveRules}

You are a certified child-safety (childproofing) expert with knowledge of pediatric injury epidemiology (WHO, CDC, EU Child Safety Alliance).

Analyze this photo of a "${room}" and identify ALL visually observable hazards for a child${child} aged ${age}.

Return ONLY valid JSON (no markdown fences) of this exact shape:
{
  "hazards": [{
    "label": "short name of the object/zone, in ${language}",
    "category": "fall|choking|poisoning|burn|electric|cutting|drowning|crush|strangulation|other",
    "severity": "critical|high|medium|low",
    "box": {"x": 0.1, "y": 0.2, "w": 0.15, "h": 0.1} (tight around THIS object only, values 0-1 relative to the whole image; the app zooms into this box and shows it to the parent, so a box covering half the room is useless),
    "why": "2-3 sentences in ${language} explaining why it is dangerous for this exact age",
    "facts": ["REQUIRED, 2-4 items. Each is a NEW fact about this object in ${language}, max 6 words, e.g. \\"Estimated temperature: 78-85°C\\", \\"Within the child's reach\\", \\"Tips over easily\\". Never repeat sentences from \\"why\\" — the app shows both, and repeating looks like filler."],
    "steps": ["1-3 imperative actions in ${language}, max 10 words each, e.g. \\"Move the cup 30 cm from the edge\\""],
    "certain": true or false (true = you clearly see it AND you know what it is; false = you see something that looks dangerous but the frame is soft, partial or ambiguous). Report both kinds; the app shows uncertain findings lower down and marks them, so doubt costs nothing and silence costs a child.
    "reach": 1-10 (how easily THIS child can reach it: 10 = on the floor or at child height, 1 = high on a ceiling),
    "size_cm": estimated longest real-world dimension of the object in centimetres, derived from reference objects in the photo (a number, e.g. 3 for a coin, 22 for a large rubber duck),
    "solution": "EXACTLY ONE key copied from this list, nothing else: ${SOLUTION_KEYS.join(' | ')}. Pick the key for the product that fixes THIS object. Never invent a key, never translate it, never write a sentence here. If no product fixes it, write none.",
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
- LANGUAGE: write ALL text values (label, why, facts, steps, stats, fix, summary) in ${language}. This is mandatory.
- "facts" and "steps" are shown as bullet lists in the app: keep them TELEGRAPHIC, no full sentences, no repetition of the label.
- "reach" drives risk ranking: a hot cup at the table edge is 9-10, a pot on a high shelf is 2-3.
- Order does not matter — the app re-ranks by real risk for the child's age.

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

/**
 * Poziv modela BEZ slike — za sud o celoj prostoriji.
 *
 * Sažimanje već potvrđenih nalaza ne traži oči nego pamet, pa se slike ne
 * šalju ponovo. To je i jedini razlog zbog kog procena celog prostora sme da
 * postoji na besplatnom planu: tekstualni poziv je red veličine jeftiniji i
 * brži od još jednog gledanja u fotografije.
 */
async function callText(p: Provider, model: string, prompt: string, language = 'Serbian'): Promise<any> {
  const res = await fetch(p.url, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: {
      'Authorization': `Bearer ${p.key}`,
      'Content-Type': 'application/json',
      ...(p.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      ...(p.extraBody ?? {}),
      ...(p.name === 'openrouter' && model.includes('reasoning')
        ? { reasoning: { enabled: false } }
        : {}),
      model,
      max_tokens: 1600,
      messages: [
        {
          role: 'system',
          content: `You are a child-safety expert. CRITICAL: write EVERY human-readable output value strictly in ${language}. Never use any other language, never mix languages.`,
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${p.name}/${model}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  let out = String(data?.choices?.[0]?.message?.content ?? '').trim();
  out = out.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = out.indexOf('{');
  const b = out.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(`${p.name}/${model}: nije JSON`);
  const parsed = JSON.parse(out.slice(a, b + 1));
  // Isti sud kao za nalaze: engleski odgovor na srpski zahtev je neuspeh.
  const spoken = [parsed.verdict, parsed.start_here,
    ...(parsed.unchecked ?? []), ...((parsed.routes ?? []).map((r: any) => r?.why))]
    .filter((x: unknown) => typeof x === 'string').join(' ');
  if (wrongLanguage(spoken, language)) {
    throw new Error(`${p.name}/${model}: sud o prostoriji na engleskom`);
  }
  return parsed;
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
    // Sumnja se PAMTI, ne briše. Ranije je nesiguran nalaz jednostavno
    // izostajao, pa se nije znalo ni da je model nešto video. Stoji POSLE
    // raširenog objekta da ga sirovi odgovor ne bi pregazio.
    uncertain: h?.certain === false,
    box: {
      x: Math.max(0, Math.min(1, Number(h.box?.x) || 0)),
      y: Math.max(0, Math.min(1, Number(h.box?.y) || 0)),
      w: Math.max(0.02, Math.min(1, Number(h.box?.w) || 0.1)),
      h: Math.max(0.02, Math.min(1, Number(h.box?.h) || 0.1)),
    },
  }));
  // Provera razmere: gušenje je fizički moguće samo za predmet koji staje u
  // usta deteta (~4.5 cm). Ako je model sam procenio da je predmet veliki
  // (velika gumena patka, lopta, plišanac), taj nalaz ne sme da prođe.
  parsed.hazards = parsed.hazards.filter((h: any) => {
    const cm = Number(h.size_cm);
    return !(h.category === 'choking' && Number.isFinite(cm) && cm > 6);
  });
  // ISTI PREDMET SE NE PRIJAVLJUJE DVAPUT.
  //
  // Uputstvo u promptu to traži, ali manji modeli ga ne poštuju pouzdano: na
  // istoj kuhinji se u jednom prolazu pojave „Ringle šporeta", „Vreo lonac" i
  // „Srebrni lonac" — tri kartice za jedno isto mesto. Roditelju to izgleda
  // kao da aplikacija ne zna šta gleda.
  //
  // Zato se preklapanje rešava merom, ne molbom: nalazi iste vrste čiji se
  // okviri poklapaju spajaju se u onaj ozbiljniji, a ključ rešenja se nasledi
  // od onoga koji ga ima.
  const foundByModel = parsed.hazards.length;
  parsed.hazards = mergeTwins(parsed.hazards);

  // Ključ rešenja mora biti sa spiska. Model ume da napiše rečenicu i pored
  // izričitog uputstva; tada se nalaz zadržava, ali bez proizvoda — pogrešan
  // proizvod je gori od nijednog.
  const allowed = new Set<string>(SOLUTION_KEYS as readonly string[]);
  parsed.hazards = parsed.hazards.map((h: any) => {
    const key = String(h.solution ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    return { ...h, solution: allowed.has(key) && key !== 'none' ? key : '' };
  });

  // Ispravan JSON na pogrešnom jeziku nije ispravan odgovor. Baca se kao i
  // svaka druga greška provajdera, pa lanac ide dalje na sledećeg.
  const spoken = [
    parsed.summary,
    ...parsed.hazards.flatMap((h: any) => [h.label, h.why, h.fix, ...(h.facts ?? [])]),
  ].filter((x: unknown) => typeof x === 'string').join(' ');
  if (wrongLanguage(spoken, language)) {
    throw new Error(`${p.name}/${model}: odgovorio na engleskom umesto na ${language}`);
  }

  parsed.safety_score = Math.max(0, Math.min(100, Number(parsed.safety_score) || 0));
  parsed._v = 4;
  parsed._found = foundByModel;
  parsed._provider = p.name;
  parsed._model = model;
  return parsed;
}

/**
 * Provera lokalnih nalaza: da li je to STVARNO ono što telefon misli.
 *
 * Detektor u telefonu poznaje osamdeset predmeta i mora nešto da odgovori na
 * svaki. Mlinovi za biber su tako postali „flaša", a uz tu reč je išao gotov
 * tekst o hemikalijama i alkoholu i to je roditelju bio PRVI nalaz na ekranu.
 * Niko tu sliku nije pogledao — ni model koji vidi, ni čovek.
 *
 * Zato svaki lokalni nalaz mora ovde da prođe: isečak slike ide modelu koji
 * gleda, sa pitanjem da li se na njemu zaista vidi to što telefon tvrdi.
 * Odgovor je namerno samo da/ne. Preimenovanje bi značilo da izmišljamo novu
 * opasnost o kojoj ništa ne znamo; ćutanje je tačnije od pogađanja.
 */
async function verify(
  provider: Provider,
  model: string,
  crops: { claim: string; image: string }[],
): Promise<boolean[]> {
  const ask =
    'For each numbered image below, decide whether it really shows the claimed object.\n' +
    'Be strict. Answer true ONLY if the claimed object is clearly visible in that image.\n' +
    'If it is a different object, or you are unsure, answer false.\n' +
    'A generic detector produced these claims, so wrong guesses are common: pepper mills claimed as a bottle, a lamp claimed as a vase, a radiator claimed as a bench.\n' +
    crops.map((c, i) => `${i}. claimed: "${c.claim}"`).join('\n') +
    '\n\nReturn ONLY this JSON: {"verdicts":[{"i":0,"real":true}]}';

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
      ...(provider.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      ...(provider.extraBody ?? {}),
      model,
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'You verify object labels in images. Answer with JSON only.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: ask },
            ...crops.map((c) => ({ type: 'image_url', image_url: { url: c.image } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider.name}/${model}: upstream ${res.status}`);
  const data = await res.json();
  let out: string = data.choices?.[0]?.message?.content?.trim() ?? '';
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!out.startsWith('{')) {
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`${provider.name}/${model}: no JSON`);
    out = m[0];
  }
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed.verdicts)) throw new Error(`${provider.name}/${model}: bad shape`);
  // Nedostaje li ijedan odgovor, taj nalaz PADA. Tišina nije potvrda.
  const said = new Map<number, boolean>();
  for (const v of parsed.verdicts) said.set(Number(v?.i), v?.real === true);
  return crops.map((_, i) => said.get(i) === true);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let active = PROVIDERS.filter((p) => p.key);
  if (active.length === 0) return json({ error: 'Nijedan AI provajder nije konfigurisan.' }, 501);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { image, roomType = 'living_room', ageGroup = '1-2y', childName, language = 'Serbian', live = false, subject = 'child', petKind } = body ?? {};

  // Stanje svakog provajdera ponaosob.
  //
  // Poruka o grešci nosi samo POSLEDNJI neuspeh, pa se iz nje ne vidi da li
  // je pao jedan ili svih pet. Bez ovoga se lanac ne može održavati — a kad
  // ceo lanac padne, roditelj ostaje na onome što je telefon sam video, i to
  // je tačno slučaj u kome aplikacija propusti očiglednu opasnost.
/**
 * Provajderi koje tek treba izmeriti pre nego što uđu u lanac.
 *
 * Projekat već drži gomilu ključeva; koji od njih ume da gleda sliku i koji
 * je zaista živ — to se ne pretpostavlja nego proba. Ova lista postoji samo
 * radi provere i ne učestvuje u analizi.
 */
const CANDIDATES: Provider[] = [
  {
    // Cerebras: besplatan nivo, hardverski ubrzan, i u spisku ima gemma-4-31b
    // koja ume da gleda sliku i pristojno piše srpski. Ako ovo prođe na
    // pravoj fotografiji, rešen je i kvalitet i brzina — bez ijedne uplate.
    name: 'cerebras',
    key: Deno.env.get('CEREBRAS_API_KEY'),
    url: 'https://api.cerebras.ai/v1/chat/completions',
    models: ['gemma-4-31b'],
  },
  {
    name: 'cerebras-alt',
    key: Deno.env.get('OPENAI_API_KEY'),
    url: 'https://api.cerebras.ai/v1/chat/completions',
    models: ['gemma-4-31b'],
  },
  {
    name: 'ai-studio-20',
    key: Deno.env.get('GOOGLE_AI_STUDIO_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.0-flash'],
  },
  {
    name: 'ai-studio-lite',
    key: Deno.env.get('GOOGLE_AI_STUDIO_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.0-flash-lite'],
  },
  {
    name: 'gemini-20',
    key: Deno.env.get('GEMINI_API_KEY'),
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.0-flash'],
  },
  {
    name: 'or-gemma-26b',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['google/gemma-4-26b-a4b-it:free'],
    extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SafeNest AI' },
  },
  {
    name: 'or-nemotron-vl',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['nvidia/nemotron-nano-12b-v2-vl:free'],
    extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SafeNest AI' },
  },
  {
    name: 'openai',
    key: Deno.env.get('OPENAI_API_KEY'),
    url: 'https://api.openai.com/v1/chat/completions',
    models: ['gpt-4o-mini'],
  },
  {
    name: 'mulerouter',
    key: Deno.env.get('MULEROUTER_API_KEY'),
    url: 'https://api.mulerouter.com/v1/chat/completions',
    models: ['gemini-2.5-flash'],
  },
  {
    name: 'groq-scout',
    key: Deno.env.get('GROQ_API_KEY'),
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['meta-llama/llama-4-scout-17b-16e-instruct'],
  },
  {
    name: 'openrouter-qwen',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['qwen/qwen2.5-vl-72b-instruct:free'],
    extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SafeNest AI' },
  },
  {
    name: 'openrouter-llama',
    key: Deno.env.get('OPENROUTER_API_KEY'),
    url: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['meta-llama/llama-3.2-11b-vision-instruct:free'],
    extraHeaders: { 'HTTP-Referer': 'https://safenessai.co.uk', 'X-Title': 'SafeNest AI' },
  },
];

  // Šta nam koji servis STVARNO nudi, pitano njega samog.
  //
  // Dvaput sam ovde upisao ime modela po sećanju i dvaput dobio 404. Spisak
  // se ne pamti nego se traži: ovo vraća modele koje ključ sme da zove.
  if (body?.action === 'models') {
    if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);
    const where: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1/models',
      cerebras: 'https://api.cerebras.ai/v1/models',
      // Ključ je greškom smešten pod imenom za OpenAI, ali počinje sa `csk-`
      // što je Cerebras. Proba se i tako, da se vidi šta je zaista unutra.
      'cerebras-alt': 'https://api.cerebras.ai/v1/models',
      together: 'https://api.together.xyz/v1/models',
    };
    const keys: Record<string, string | undefined> = {
      groq: Deno.env.get('GROQ_API_KEY'),
      cerebras: Deno.env.get('CEREBRAS_API_KEY'),
      'cerebras-alt': Deno.env.get('OPENAI_API_KEY'),
      together: Deno.env.get('TOGETHER_API_KEY'),
    };
    const out: Record<string, unknown> = {};
    for (const [name, url] of Object.entries(where)) {
      const key = keys[name];
      if (!key) { out[name] = 'nema ključa'; continue; }
      try {
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(20000),
        });
        const t = await r.text();
        if (!r.ok) { out[name] = `${r.status} ${t.slice(0, 120)}`; continue; }
        const list = JSON.parse(t).data ?? [];
        out[name] = list.map((m: any) => m.id).slice(0, 60);
      } catch (e: any) {
        out[name] = `pad: ${String(e?.message ?? e).slice(0, 100)}`;
      }
    }
    return json({ models: out });
  }

  if (body?.action === 'providers') {
    if (!ADMIN || body.admin_key !== ADMIN) return json({ error: 'unauthorized' }, 401);
    const dot =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2NgGAWjYBSMglEwCkbBKBgFo2AUAAAGmgABr0EPFwAAAABJRU5ErkJggg==';
    const out: Record<string, string> = {};
    const probe = body.candidates === true ? [...PROVIDERS, ...CANDIDATES] : PROVIDERS;

    // Sa pravom slikom se meri ono što se zaista dešava: ceo upit, ceo
    // odgovor, i vreme koje na to stvarno ode. Tačkica od osam piksela je
    // ranije pokazala da provajder „radi" za 350 ms, a na pravoj fotografiji
    // mu treba višestruko više — pa sam po toj laži postavio prekratak rok i
    // sam pogasio one koji rade.
    if (typeof image === 'string' && image.startsWith('data:image/')) {
      const real = buildPrompt(String(roomType), String(ageGroup), undefined, String(language).slice(0, 30), false);
      for (const p of probe) {
        if (!p.key) { out[p.name] = 'nema ključa'; continue; }
        const t0 = Date.now();
        try {
          const r = await callVision(p, p.models[0], image, real, String(language).slice(0, 30));
          out[p.name] = `radi ${Date.now() - t0} ms · ${r.hazards.length} nalaza · ${p.models[0]}`;
        } catch (e: any) {
          out[p.name] = `${Date.now() - t0} ms · ${String(e?.message ?? e).slice(0, 120)}`;
        }
      }
      return json({ providers: out });
    }

    for (const p of probe) {
      if (!p.key) { out[p.name] = 'nema ključa'; continue; }
      const model = p.models[0];
      const t0 = Date.now();
      try {
        const res = await fetch(p.url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${p.key}`,
            'Content-Type': 'application/json',
            ...(p.extraHeaders ?? {}),
          },
          body: JSON.stringify({
            ...(p.extraBody ?? {}),
            model,
            max_tokens: 16,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'Reply with the single word OK.' },
                { type: 'image_url', image_url: { url: dot } },
              ],
            }],
          }),
          signal: AbortSignal.timeout(30000),
        });
        const text = await res.text();
        out[p.name] = res.ok
          ? `radi (${Date.now() - t0} ms) ${model}`
          : `${res.status} ${text.slice(0, 160)}`;
      } catch (e: any) {
        out[p.name] = `pad: ${String(e?.message ?? e).slice(0, 160)}`;
      }
    }
    return json({ providers: out });
  }

  /**
   * PRIJEM ISPRAVKI OD RODITELJA — građa za sledeći trening modela.
   *
   * Ovo je zaseban posao i po logici bi mu pripadala zasebna funkcija. Nije
   * je dobila jer je projekat dostigao dozvoljen broj funkcija, a plaćanje
   * većeg plana nije opcija. Stoji dakle ovde, kao još jedna radnja, i to je
   * jedina veza sa ostatkom fajla.
   *
   * Šta SME da stigne, i ništa više: isečak označenog predmeta (klijent ga
   * pravi najviše 224 px), ime klase koju je model tvrdio, i sud roditelja.
   * Šta se NE prima i ne upisuje: nalog, ime, e-pošta, uređaj, mesto, tačno
   * vreme skeniranja, cela fotografija. Zapis se namerno ne može vezati za
   * osobu — ni od nas, ni od nekoga ko bi jednog dana video bazu.
   */
  /**
   * PROCENA CELE PROSTORIJE — spajanje nalaza sa više uglova u jedan sud.
   *
   * Klijent šalje samo NALAZE, ne slike: jedan tekstualni poziv umesto još
   * nekoliko gledanja u fotografije. Zato je ovo i brzo i besplatno.
   */
  if (body?.action === 'room') {
    const angles = Array.isArray(body?.angles) ? body.angles.slice(0, 8) : [];
    const usable = angles.filter((a: any) => Array.isArray(a?.hazards) && a.hazards.length);
    if (usable.length < 2) {
      return json({ error: 'treba bar dva ugla sa nalazima' }, 400);
    }
    const lang = String(language).slice(0, 30);
    const errs: string[] = [];
    const until = Date.now() + BUDGET_MS;
    for (const provider of active) {
      if (isAsleep(provider.name)) continue;
      for (const model of provider.models) {
        if (Date.now() > until) break;
        try {
          const v = await roomVerdict(provider, model, lang, usable,
            String(roomType), String(ageGroup));
          return json({ ...v, _provider: provider.name, _angles: usable.length });
        } catch (e: any) {
          const why = e?.message ?? String(e);
          errs.push(why);
          if (noteFailure(provider.name, why)) break;
        }
      }
    }
    console.error('room verdict failed:', errs.join(' | '));
    return json({ error: 'Procena prostorije trenutno nije dostupna.' }, 502);
  }

  if (body?.action === 'learn') {
    const KNOWN = new Set([
      'socket', 'stairs', 'candle', 'plastic_bag', 'blind', 'fireplace',
      'stove', 'heater', 'kettle', 'coin', 'bathtub', 'drawer',
      'knife', 'scissors', 'fork', 'spoon', 'bottle', 'cup', 'bowl',
      'wine glass', 'vase', 'oven', 'toaster', 'microwave', 'sink',
      'refrigerator', 'toilet', 'potted plant', 'book', 'remote',
      'cell phone', 'hair drier', 'teddy bear', 'handbag', 'backpack',
      'suitcase', 'umbrella', 'chair', 'couch', 'bed', 'dining table', 'tv',
      'sports ball', 'frisbee', 'kite', 'clock', 'toothbrush', 'mouse',
      'keyboard', 'apple', 'orange', 'carrot', 'banana', 'tie',
    ]);
    const claim = String(body?.claim ?? '').trim();
    const crop = String(body?.crop ?? '');
    const correct = body?.correct;
    if (!KNOWN.has(claim)) return json({ error: 'unknown class' }, 400);
    if (typeof correct !== 'boolean') return json({ error: 'missing verdict' }, 400);
    if (!crop.startsWith('data:image/jpeg;base64,')) return json({ error: 'crop must be jpeg' }, 400);
    if (crop.length > 220_000) return json({ error: 'crop too large' }, 413);

    const dbUrl = Deno.env.get('SUPABASE_URL');
    const dbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!dbUrl || !dbKey) return json({ error: 'not configured' }, 500);

    const bytes = Uint8Array.from(atob(crop.split(',')[1]), (c) => c.charCodeAt(0));
    // Ime je nasumično i ne govori ništa: ni ko, ni kada, ni odakle.
    const name = `${claim}/${correct ? 'da' : 'ne'}/${crypto.randomUUID()}.jpg`;

    const up = await fetch(`${dbUrl}/storage/v1/object/sn-learning/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dbKey}`,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=0',
      },
      body: bytes,
    });
    if (!up.ok) {
      console.error('learn upload failed:', up.status, await up.text());
      return json({ error: 'store failed' }, 500);
    }
    // Dan, ne trenutak: tačno vreme skeniranja je podatak o navikama
    // porodice, a za učenje ne znači ništa.
    const ins = await fetch(`${dbUrl}/rest/v1/sn_learning`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dbKey}`,
        apikey: dbKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        claim, correct, crop_path: name,
        day: new Date().toISOString().slice(0, 10),
      }),
    });
    if (!ins.ok) {
      console.error('learn insert failed:', ins.status, await ins.text());
      return json({ error: 'store failed' }, 500);
    }
    return json({ ok: true });
  }

  if (body?.action === 'verify') {
    const crops = Array.isArray(body.crops) ? body.crops.slice(0, 6) : [];
    const clean = crops.filter(
      (c: any) => typeof c?.claim === 'string' && typeof c?.image === 'string'
        && c.image.startsWith('data:image/') && c.image.length < 400_000,
    );
    if (!clean.length) return json({ verdicts: [] });
    const errors: string[] = [];
    for (const provider of active) {
      for (const model of provider.models) {
        try {
          return json({ verdicts: await verify(provider, model, clean) });
        } catch (e: any) {
          errors.push(e?.message ?? String(e));
        }
      }
    }
    // Niko nije odgovorio: ništa se ne potvrđuje. Nepotvrđen nalaz se ne
    // prikazuje, pa je najgori ishod da roditelj vidi samo ono što je oblak
    // ionako već našao — a ne izmišljenu opasnost.
    console.error('verify failed:', errors.join(' | '));
    return json({ verdicts: clean.map(() => false) });
  }

  // Redosled je već postavljen po izmerenom kvalitetu (vidi `PROVIDERS`).
  // Ovde je ranije stajalo dodatno preslaganje koje je Gemini guralo na čelo
  // za foto režim — sada je suvišno, jer prva dva mesta ionako drže dva puta
  // do istog modela, a preslaganje je samo trošilo jedan prazan hod.
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return json({ error: 'Missing image (data URL)' }, 400);
  if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

  // Departman se bira zahtevom, a ne zasebnom funkcijom: isti lanac
  // provajdera, isto merenje jezika, isti budžet vremena, ista provera
  // razmere. Razlikuje se samo pitanje koje se modelu postavlja.
  const prompt = subject === 'pet'
    ? buildPetPrompt(String(roomType), String(petKind ?? 'dog-small'), String(language).slice(0, 30), live === true)
    : buildPrompt(String(roomType), String(ageGroup), childName ? String(childName).slice(0, 40) : undefined, String(language).slice(0, 30), live === true);

  const errors: string[] = [];
  const deadline = Date.now() + BUDGET_MS;
  for (const provider of active) {
    if (isAsleep(provider.name)) continue;
    for (const model of provider.models) {
      // Bolje uredan neuspeh nego rušenje funkcije: kad ponestane budžeta,
      // klijent dobija poruku i može da pokuša ponovo, a uspavani provajderi
      // znače da sledeći pokušaj kreće od drugog mesta u lancu.
      if (Date.now() > deadline) {
        errors.push('istekao budžet vremena');
        break;
      }
      try {
        const first = await Promise.race([
          callVision(provider, model, image, prompt, String(language).slice(0, 30)),
          new Promise((_, no) => setTimeout(() => no(new Error(`${provider.name}: predugo`)), TRY_MS)),
        ]) as any;
        // Fotografija dobija i drugi pogled; uživo ne, tamo je brzina važnija.
        // Pad drugog pogleda ne sme da odnese prvi nalaz — zato `catch` koji
        // vraća ono što već imamo.
        //
        // Drugi pogled se preskače kad je prvi prolaz pojeo budžet. Kad lanac
        // padne na spor provajder, prvi prolaz zna da traje devedeset sekundi;
        // drugi bi tada oborio celu funkciju, pa bi roditelj umesto sedam
        // nalaza dobio šifru greške. Bolje pet nalaza nego nijedan.
        if (live === true || Date.now() > deadline - TRY_MS) return json(first);
        try {
          return json(await Promise.race([
            secondLook(provider, model, image, String(language).slice(0, 30), first,
              String(roomType), String(ageGroup)),
            new Promise((_, no) => setTimeout(() => no(new Error('drugi pogled: predugo')), TRY_MS)),
          ]) as any);
        } catch (e: any) {
          console.error('drugi pogled pao:', e?.message ?? String(e));
          return json(first);
        }
      } catch (e: any) {
        const why = e?.message ?? String(e);
        errors.push(why);
        // „upstream 429" i slično — nalog nema kvotu, ne vredi dalje ni sa
        // drugim modelom istog provajdera.
        if (noteFailure(provider.name, why)) break;
      }
    }
  }
  console.error('all providers failed:', errors.join(' | '));
  return json({ error: `Svi AI provajderi trenutno nedostupni. Pokušajte za minut. (${errors[errors.length - 1]})` }, 502);
});
