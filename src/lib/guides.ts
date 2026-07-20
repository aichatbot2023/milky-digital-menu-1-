/**
 * Ekspertsko znanje koje KAMERA NE VIDI:
 *  - check-liste bezbednosti po prostoriji (bojler, utičnice, gajtani…)
 *  - vodiči prve pomoći (offline, korak po korak)
 * Sve dvojezično (sr + en); stanje čekiranja se čuva na uređaju.
 */
import type { RoomType } from "../types";
import { isSr } from "./i18n";

type Bi = { sr: string; en: string };
const pick = (b: Bi) => (isSr() ? b.sr : b.en);

// ---------- CHECK-LISTE PO PROSTORIJI ----------

const CHECKLISTS: Record<RoomType, Bi[]> = {
  living_room: [
    { sr: "TV, police i komode pričvršćeni na zid (protiv prevrtanja)", en: "TV, shelves and dressers anchored to the wall (anti-tip)" },
    { sr: "Zaštitni poklopci na svim utičnicama u visini deteta", en: "Safety covers on all outlets within the child's reach" },
    { sr: "Gajtani roletni i zavesa skraćeni ili zamenjeni bezgajtanskim", en: "Blind and curtain cords shortened or replaced with cordless" },
    { sr: "Pod pregledan: bez novčića, baterija, sitne plastike i delova igračaka", en: "Floor swept: no coins, batteries, small plastic or toy parts" },
    { sr: "Gumeni štitnici na uglovima stola i nameštaja", en: "Corner guards on table and furniture edges" },
    { sr: "Kablovi sklonjeni ili fiksirani uz zid", en: "Cables tucked away or fixed along the wall" },
    { sr: "Upaljači, šibice, sveće i alkohol van domašaja", en: "Lighters, matches, candles and alcohol out of reach" },
    { sr: "Stepenište/balkon obezbeđeni sigurnosnom kapijom", en: "Stairs/balcony secured with a safety gate" },
  ],
  kitchen: [
    { sr: "Ručke šerpi okrenute ka unutra; kuvanje na zadnjim ringlama", en: "Pot handles turned inward; cook on back burners" },
    { sr: "Noževi i makaze u fioci sa bravicom za decu", en: "Knives and scissors in a child-locked drawer" },
    { sr: "Hemikalije ispod sudopere premeštene ili zaključane", en: "Under-sink chemicals moved up or locked away" },
    { sr: "Zaštita za šporet i bravica na vratima rerne", en: "Stove guard fitted and oven door lock in place" },
    { sr: "Plastične kese i folije van domašaja", en: "Plastic bags and cling film out of reach" },
    { sr: "Bez visećeg stolnjaka dok je dete malo", en: "No hanging tablecloth while your child is small" },
    { sr: "Sitni magneti sa frižidera uklonjeni", en: "Small fridge magnets removed" },
    { sr: "Stolice i merdevine ne stoje uz radnu površinu", en: "Chairs and step ladders kept away from the counter" },
  ],
  bathroom: [
    { sr: "Bojler ograničen na ≤ 50°C (zaštita od opekotina vrelom vodom)", en: "Boiler limited to ≤ 50°C (hot-water scald protection)" },
    { sr: "Lekovi, vitamini i kozmetika zaključani ili visoko", en: "Medicines, vitamins and cosmetics locked or up high" },
    { sr: "Fen i brijač isključeni iz utičnice odmah posle upotrebe", en: "Hair dryer and razor unplugged right after use" },
    { sr: "Bravica na WC dasci; vrata kupatila zatvorena", en: "Toilet-lid lock fitted; bathroom door kept closed" },
    { sr: "Protivklizna podloga u kadi/tuš kabini", en: "Non-slip mat in the bath/shower" },
    { sr: "Kada se nikad ne ostavlja puna vode", en: "Bath never left filled with water" },
    { sr: "Žileti i makazice u zaključanom ormariću", en: "Razors and small scissors in a locked cabinet" },
    { sr: "Sredstva za čišćenje van domašaja deteta", en: "Cleaning products out of the child's reach" },
  ],
  bedroom: [
    { sr: "Krevetac bebe do 12m: prazan — bez jastuka, ćebadi i plišanih", en: "Cot for under-12m: bare — no pillows, blankets or plush toys" },
    { sr: "Krevetac dalje od prozora, radijatora i gajtana", en: "Cot away from windows, radiators and cords" },
    { sr: "Komoda pričvršćena na zid; fioke sa bravicama", en: "Dresser anchored to the wall; drawers with latches" },
    { sr: "Kabl bebi-monitora najmanje 1 m od kreveca", en: "Baby-monitor cable at least 1 m from the cot" },
    { sr: "Prozor sa sigurnosnom bravicom", en: "Window fitted with a safety lock" },
    { sr: "Noćna lampa hladna na dodir (LED)", en: "Night light cool to the touch (LED)" },
    { sr: "Sitnice sa noćnog stočića sklonjene (lekovi, nakit, novčići)", en: "Nightstand cleared of small items (pills, jewellery, coins)" },
    { sr: "Vrata plakara obezbeđena da ne priklješte prste", en: "Wardrobe doors secured against finger traps" },
  ],
  restaurant_table: [
    { sr: "Nož i viljuška odmah sklonjeni van domašaja deteta", en: "Knife and fork moved out of the child's reach immediately" },
    { sr: "Vrući napici na sredini stola, nikad na ivici", en: "Hot drinks in the middle of the table, never at the edge" },
    { sr: "Bez stolnjaka koji visi (dete ga povlači)", en: "No hanging tablecloth (children pull it)" },
    { sr: "Čaše i flaše dalje od ivice stola", en: "Glasses and bottles away from the table edge" },
    { sr: "Hranilica stabilna i kaiš vezan", en: "High chair stable and harness fastened" },
    { sr: "So, biber, čačkalice i šećer sklonjeni", en: "Salt, pepper, toothpicks and sugar moved away" },
    { sr: "Vrela supa/tanjir se ne dodaje preko deteta", en: "Hot soup/plates never passed over the child" },
    { sr: "Dete ne sedi na putanji konobara", en: "Child not seated in the waiters' path" },
  ],
  outdoor: [
    { sr: "Kapija zaključana; ograda bez razmaka većeg od 10 cm", en: "Gate locked; fence gaps no wider than 10 cm" },
    { sr: "Bazen/bure/kadica ograđeni ili prazni — 5 cm vode je dovoljno za davljenje", en: "Pool/barrel/paddling pool fenced or emptied — 5 cm of water can drown a child" },
    { sr: "Alat, đubrivo i pesticidi zaključani", en: "Tools, fertiliser and pesticides locked away" },
    { sr: "Biljke u dvorištu proverene na otrovnost", en: "Garden plants checked for toxicity" },
    { sr: "Ljuljaška i tobogan na mekoj podlozi, vijci dotegnuti", en: "Swing and slide on soft ground, bolts tightened" },
    { sr: "Roštilj hladan ili ograđen; žar nikad bez nadzora", en: "BBQ cool or fenced; embers never unattended" },
    { sr: "Provereno da nema gnezda osa/stršljenova", en: "Checked for wasp/hornet nests" },
    { sr: "Kaciga za bicikl, romobil i skejt uvek na glavi", en: "Helmet always on for bike, scooter and skateboard" },
  ],
};

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

const CHECK_KEY = "safenest.checklist";

function loadChecks(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CHECK_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getChecklist(room: RoomType): ChecklistItem[] {
  const state = loadChecks();
  return CHECKLISTS[room].map((item, i) => ({
    id: `${room}-${i}`,
    text: pick(item),
    done: Boolean(state[`${room}-${i}`]),
  }));
}

export function toggleCheck(id: string) {
  const state = loadChecks();
  state[id] = !state[id];
  try {
    localStorage.setItem(CHECK_KEY, JSON.stringify(state));
  } catch {
    /* ignoriši */
  }
}

export function checklistProgress(room: RoomType): { done: number; total: number } {
  const items = getChecklist(room);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// ---------- PRVA POMOĆ (offline vodiči) ----------

export interface FirstAidTopic {
  id: string;
  icon: string;
  title: string;
  steps: string[];
}

const FIRST_AID: { id: string; icon: string; title: Bi; steps: Bi[] }[] = [
  {
    id: "choking-baby",
    icon: "🫁",
    title: { sr: "Gušenje — beba do 1 godine", en: "Choking — baby under 1 year" },
    steps: [
      { sr: "Ako beba kašlje ili plače — pustite je da kašlje, ne vadite predmet prstom naslepo.", en: "If the baby is coughing or crying — let them cough; never sweep the mouth blindly." },
      { sr: "Ako ne diše/ne pušta zvuk: položite je licem nadole na svoju podlakticu, glava niže od tela.", en: "If not breathing/silent: lay the baby face-down along your forearm, head lower than the body." },
      { sr: "Dlanom udarite 5 puta među lopatice.", en: "Give 5 firm back blows between the shoulder blades with your palm." },
      { sr: "Okrenite bebu na leđa i sa 2 prsta pritisnite 5 puta sredinu grudne kosti.", en: "Turn the baby face-up and give 5 chest thrusts with 2 fingers on the centre of the breastbone." },
      { sr: "Naizmenično ponavljajte 5+5 dok predmet ne izađe ili beba ne zaplače.", en: "Alternate 5 back blows + 5 chest thrusts until the object comes out or the baby cries." },
      { sr: "Ako beba izgubi svest — odmah pozovite hitnu i počnite oživljavanje (CPR).", en: "If the baby becomes unresponsive — call emergency services immediately and start CPR." },
    ],
  },
  {
    id: "choking-child",
    icon: "🫁",
    title: { sr: "Gušenje — dete starije od 1 godine", en: "Choking — child over 1 year" },
    steps: [
      { sr: "Ohrabrite dete da kašlje — kašalj je najefikasniji.", en: "Encourage the child to cough — coughing is most effective." },
      { sr: "Ako ne može da kašlje/govori: nagnite ga napred i udarite 5 puta dlanom među lopatice.", en: "If they can't cough/speak: lean them forward and give 5 back blows between the shoulder blades." },
      { sr: "Ako ne pomogne: stanite iza deteta, pesnicu iznad pupka, obuhvatite drugom rukom i povucite naglo ka sebi i nagore — 5 puta (Hajmlihov zahvat).", en: "If that fails: stand behind the child, fist above the navel, grasp with your other hand and pull sharply inward and upward — 5 times (Heimlich manoeuvre)." },
      { sr: "Naizmenično 5 udaraca + 5 potisaka dok predmet ne izađe.", en: "Alternate 5 back blows + 5 abdominal thrusts until the object comes out." },
      { sr: "Ako dete izgubi svest — pozovite hitnu i počnite CPR.", en: "If the child becomes unresponsive — call emergency services and start CPR." },
    ],
  },
  {
    id: "burn",
    icon: "🔥",
    title: { sr: "Opekotina", en: "Burn or scald" },
    steps: [
      { sr: "Odmah pod hladnu tekuću vodu (ne ledenu) — 20 minuta.", en: "Cool immediately under cool running water (not ice-cold) — for 20 minutes." },
      { sr: "Skinite odeću i nakit oko opekotine, OSIM ako su zalepljeni za kožu.", en: "Remove clothing and jewellery near the burn, UNLESS stuck to the skin." },
      { sr: "Ne stavljajte led, masti, pastu za zube ni kućne 'lekove'.", en: "Do not apply ice, creams, toothpaste or home remedies." },
      { sr: "Prekrijte čistom vlažnom gazom ili prozirnom folijom.", en: "Cover loosely with clean damp gauze or cling film." },
      { sr: "Hitna pomoć: ako je opekotina veća od dečjeg dlana, na licu/šakama/preponama, ili od struje/hemikalija.", en: "Seek emergency care if larger than the child's palm, on face/hands/groin, or caused by electricity/chemicals." },
    ],
  },
  {
    id: "poison",
    icon: "☠️",
    title: { sr: "Trovanje (lekovi, hemikalije, biljke)", en: "Poisoning (medicines, chemicals, plants)" },
    steps: [
      { sr: "NE izazivajte povraćanje i ne dajite mleko/vodu bez uputstva lekara.", en: "Do NOT induce vomiting and don't give milk/water unless told by a professional." },
      { sr: "Odmah pozovite hitnu pomoć ili centar za kontrolu trovanja.", en: "Call emergency services or your poison control centre immediately." },
      { sr: "Ponesite/slikajte ambalažu proizvoda koji je dete uzelo.", en: "Keep or photograph the packaging of what the child took." },
      { sr: "Ako je hemikalija na koži/u oku — ispirajte vodom 15–20 minuta.", en: "If chemical on skin/in eye — rinse with water for 15–20 minutes." },
      { sr: "Ako dete povraća samo od sebe, okrenite ga na bok.", en: "If the child vomits on their own, turn them on their side." },
    ],
  },
  {
    id: "drowning",
    icon: "💧",
    title: { sr: "Davljenje", en: "Drowning" },
    steps: [
      { sr: "Izvucite dete iz vode što pre (pazite na svoju bezbednost).", en: "Get the child out of the water fast (mind your own safety)." },
      { sr: "Proverite da li diše — gledajte, slušajte, osetite 10 sekundi.", en: "Check breathing — look, listen and feel for 10 seconds." },
      { sr: "Ako ne diše: 5 početnih udaha, zatim CPR (30 pritisaka + 2 udaha).", en: "If not breathing: give 5 rescue breaths, then CPR (30 compressions + 2 breaths)." },
      { sr: "Pozovite hitnu — i kada dete izgleda dobro (sekundarno davljenje).", en: "Call emergency services — even if the child seems fine (secondary drowning)." },
      { sr: "Skinite mokru odeću i utoplite dete.", en: "Remove wet clothes and keep the child warm." },
    ],
  },
  {
    id: "head",
    icon: "🤕",
    title: { sr: "Pad i udarac glave", en: "Fall and head injury" },
    steps: [
      { sr: "Smirite dete; hladan oblog na oteklinu (ne direktno led na kožu).", en: "Comfort the child; cold compress on the bump (never ice directly on skin)." },
      { sr: "Posmatrajte 24–48h — ne mora budno, sme da spava, ali proveravajte.", en: "Observe for 24–48h — sleep is allowed, but check on them regularly." },
      { sr: "HITNO ako: gubi svest, povraća više puta, neuobičajeno pospano, nejednake zenice, curenje iz uva/nosa, grčevi.", en: "EMERGENCY if: loss of consciousness, repeated vomiting, unusual drowsiness, unequal pupils, fluid from ear/nose, seizures." },
      { sr: "Beba mlađa od 12 meseci posle pada sa visine — uvek lekarski pregled.", en: "A baby under 12 months after a height fall — always get medical review." },
    ],
  },
  {
    id: "electric",
    icon: "⚡",
    title: { sr: "Strujni udar", en: "Electric shock" },
    steps: [
      { sr: "PRVO isključite struju (osigurač/utikač) — ne dodirujte dete dok je u kontaktu sa izvorom.", en: "FIRST cut the power (breaker/plug) — do not touch the child while in contact with the source." },
      { sr: "Ako morate, odgurnite izvor suvim nemetalnim predmetom (drška metle).", en: "If needed, push the source away with a dry non-metal object (broom handle)." },
      { sr: "Proverite svest i disanje; ako ne diše — CPR.", en: "Check consciousness and breathing; if not breathing — CPR." },
      { sr: "Uvek pozovite hitnu i posle 'malog' udara — srce može reagovati kasnije.", en: "Always call emergency care even after a 'minor' shock — heart effects can be delayed." },
      { sr: "Opekotine na mestu ulaska/izlaska struje prekrijte sterilnom gazom.", en: "Cover entry/exit burn points with sterile gauze." },
    ],
  },
];

export function getFirstAidTopics(): FirstAidTopic[] {
  return FIRST_AID.map((topic) => ({
    id: topic.id,
    icon: topic.icon,
    title: pick(topic.title),
    steps: topic.steps.map(pick),
  }));
}
