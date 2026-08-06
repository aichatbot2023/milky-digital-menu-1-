/**
 * Baza znanja za LJUBIMCE — isti motor, drugi svet opasnosti.
 *
 * Ovo nije prevod dečje baze. Ljubimac se u istoj sobi ponaša drugačije od
 * deteta, pa se i opasnosti razlikuju iz temelja:
 *
 *   - dete ne jede čokoladu sa stola dok ga niko ne gleda, pas jede;
 *   - dete se ne penje na frižider, mačka se penje;
 *   - dete ne guta kanap, mačka guta — i to je hirurška hitnost;
 *   - dete ne spava u mašini za veš, mačka spava;
 *   - dete ne skače kroz prozor na petom spratu, mačka skače.
 *
 * Zato je i sama mera drugačija. Kod deteta se pita „dohvata li", a kod
 * ljubimca „može li da dođe do toga" — a mačka može svuda. Kod deteta uzrast
 * određuje rizik; kod ljubimca vrsta, jer ista biljka mačku ubija a psu ne
 * smeta, i isti lek koji je za psa opasan mačku ubija u tragovima.
 *
 * IZVORI: ASPCA Animal Poison Control, Međunarodno udruženje veterinara
 * (WSAVA), britanski PDSA i Cats Protection. Nijedan broj ovde nije izmišljen;
 * gde nema pouzdanog podatka, ne stoji ni broj.
 */
import type { Hazard, HazardCategory } from "../types";

/**
 * Vrsta i veličina ljubimca. Stoji na mestu na kom kod dece stoji uzrast,
 * jer igra istu ulogu: određuje šta je opasno i koliko.
 */
export type PetKind =
  | "dog-small"
  | "dog-large"
  | "cat"
  | "rabbit"
  | "bird"
  | "rodent";

export const PET_KINDS: PetKind[] = [
  "dog-small", "dog-large", "cat", "rabbit", "bird", "rodent",
];

export const PET_LABELS_SR: Record<PetKind, string> = {
  "dog-small": "Mali pas",
  "dog-large": "Veliki pas",
  cat: "Mačka",
  rabbit: "Zec",
  bird: "Ptica",
  rodent: "Glodar (hrčak, zamorac)",
};

export const PET_LABELS_EN: Record<PetKind, string> = {
  "dog-small": "Small dog",
  "dog-large": "Large dog",
  cat: "Cat",
  rabbit: "Rabbit",
  bird: "Bird",
  rodent: "Rodent (hamster, guinea pig)",
};

type Sev = Hazard["severity"];
type BySpecies = Partial<Record<PetKind, Sev>>;

/** Skraćenice za čitljivost tabele ispod. */
const ALL = (s: Sev): BySpecies => ({
  "dog-small": s, "dog-large": s, cat: s, rabbit: s, bird: s, rodent: s,
});
const DOGS = (s: Sev): BySpecies => ({ "dog-small": s, "dog-large": s });
const CLIMBERS = (s: Sev): BySpecies => ({ cat: s, bird: s });
const CHEWERS = (s: Sev): BySpecies => ({ rabbit: s, rodent: s, "dog-small": s, "dog-large": s });

export interface PetRule {
  labelSr: string;
  labelEn: string;
  category: HazardCategory;
  severity: BySpecies;
  whySr: string;
  whyEn: string;
  statsSr: string;
  statsEn: string;
  fixSr: string;
  fixEn: string;
  /** Ključ proizvoda koji ovo rešava (vidi `petProducts.ts`). */
  solution?: string;
}

/**
 * Predmet koji detektor prepozna → šta on znači za ljubimca.
 *
 * Ključevi su COCO klase i klase našeg istreniranog modela, dakle isti ulaz
 * koji već stiže iz `detector.ts`. Nijedan novi model nije potreban da bi
 * ovaj departman radio — potrebna je druga pamet nad istim očima.
 */
export const PET_RULES: Record<string, PetRule> = {
  // ── Trovanje: najčešći razlog hitnog odlaska kod veterinara ────────────
  "potted plant": {
    labelSr: "Sobna biljka",
    labelEn: "Houseplant",
    category: "poisoning",
    severity: { cat: "critical", bird: "critical", rabbit: "high", rodent: "high", "dog-small": "high", "dog-large": "medium" },
    whySr: "Ljiljan je za mačku smrtonosan — dovoljno je da liže polen sa šape ili popije vodu iz vaze, i za dva dana otkažu bubrezi. Difenbahija, filodendron, dracena i božićna zvezda takođe truju.",
    whyEn: "Lilies are lethal to cats — licking pollen off a paw or drinking vase water is enough to shut the kidneys down within two days. Dieffenbachia, philodendron, dracaena and poinsettia are toxic too.",
    statsSr: "Biljke su među pet najčešćih uzroka poziva centrima za trovanje životinja (ASPCA).",
    statsEn: "Plants are among the five most common calls to animal poison control (ASPCA).",
    fixSr: "Proverite vrstu biljke. Ako je ljiljan, iznesite ga iz stana — ne postoji bezbedna visina za mačku.",
    fixEn: "Check the species. If it is a lily, remove it from the home — no shelf is high enough for a cat.",
    solution: "plant_shelf",
  },
  bottle: {
    labelSr: "Flaša",
    labelEn: "Bottle",
    category: "poisoning",
    severity: ALL("high"),
    whySr: "Sredstva za čišćenje i antifriz su slatkastog ukusa i ljubimci ih rado ližu. Antifriz ubija mačku u količini od jedne kašičice.",
    whyEn: "Cleaning products and antifreeze taste sweet and pets lick them readily. A teaspoon of antifreeze kills a cat.",
    statsSr: "Etilen-glikol (antifriz) je jedan od najsmrtonosnijih otrova za mačke i pse (ASPCA).",
    statsEn: "Ethylene glycol (antifreeze) is among the deadliest poisons for cats and dogs (ASPCA).",
    fixSr: "Hemiju držite u zatvorenom ormariću sa bravicom, nikad na podu ni u garaži nadohvat.",
    fixEn: "Keep chemicals in a latched cupboard, never on the floor or within reach in the garage.",
    solution: "cabinet_lock",
  },
  cake: {
    labelSr: "Kolač / slatkiš",
    labelEn: "Cake / sweets",
    category: "poisoning",
    severity: { ...DOGS("critical"), cat: "high" },
    whySr: "Čokolada sadrži teobromin koji pas ne razgrađuje, a ksilitol iz slatkiša bez šećera obara psu šećer u krvi za pola sata i uništava jetru.",
    whyEn: "Chocolate contains theobromine that dogs cannot break down, and xylitol in sugar-free sweets crashes a dog's blood sugar within half an hour and destroys the liver.",
    statsSr: "Čokolada je najčešći uzrok trovanja pasa u domaćinstvu (ASPCA).",
    statsEn: "Chocolate is the most common household poisoning in dogs (ASPCA).",
    fixSr: "Sklonite sa stola i radne ploče. Pas dohvata i ono što mislite da je previsoko.",
    fixEn: "Clear the table and worktop. A dog reaches higher than you think.",
  },
  donut: {
    labelSr: "Slatkiš",
    labelEn: "Sweet snack",
    category: "poisoning",
    severity: DOGS("high"),
    whySr: "Ksilitol i čokolada u slatkišima su za psa otrov, a testo sa kvascem nastavlja da raste u želucu.",
    whyEn: "Xylitol and chocolate in sweets are poison to a dog, and yeast dough keeps rising in the stomach.",
    statsSr: "Ksilitol izaziva pad šećera u krvi psa u roku od 30 minuta (ASPCA).",
    statsEn: "Xylitol drops a dog's blood sugar within 30 minutes (ASPCA).",
    fixSr: "Ne ostavljajte slatkiše na dohvat; proverite deklaraciju na proizvodima bez šećera.",
    fixEn: "Do not leave sweets within reach; check labels on sugar-free products.",
  },
  // ── Gutanje i zapušenje ────────────────────────────────────────────────
  blind: {
    labelSr: "Gajtan roletne",
    labelEn: "Blind cord",
    category: "strangulation",
    severity: { cat: "critical", bird: "critical", "dog-small": "high", "dog-large": "medium", rabbit: "medium", rodent: "medium" },
    whySr: "Mačka se igra visećim kanapom i uplete se; ptica se zakači nogom ili krilom. Kanap koji se guta pravi linearno strano telo — creva se naberu na njega i to je hitna operacija.",
    whyEn: "A cat plays with a hanging cord and gets tangled; a bird catches a leg or wing. A swallowed cord becomes a linear foreign body — the gut bunches along it, and that is emergency surgery.",
    statsSr: "Linearna strana tela (kanap, konac, traka) su među najtežim hitnim slučajevima kod mačaka (WSAVA).",
    statsEn: "Linear foreign bodies (string, thread, ribbon) are among the most severe feline emergencies (WSAVA).",
    fixSr: "Skratite i namotajte gajtan u držač na zidu. Isto važi za konac, vunicu i trake za kosu.",
    fixEn: "Shorten and wind the cord into a wall cleat. The same goes for thread, yarn and hair ties.",
    solution: "cord_winder",
  },
  coin: {
    labelSr: "Novčić",
    labelEn: "Coin",
    category: "poisoning",
    severity: { ...DOGS("critical"), cat: "high", bird: "critical" },
    whySr: "Progutan novčić nije samo zapušenje: cink iz kovanica u želudačnoj kiselini truje krv i razara crvena krvna zrnca.",
    whyEn: "A swallowed coin is not just a blockage: zinc from coins leaches in stomach acid and destroys red blood cells.",
    statsSr: "Trovanje cinkom iz progutanih kovanica opisano je kao čest hitan slučaj kod pasa (ASPCA).",
    statsEn: "Zinc toxicosis from swallowed coins is a well-documented canine emergency (ASPCA).",
    fixSr: "Pokupite sitninu sa poda i niskih površina; isto važi za dugmaste baterije i gumice.",
    fixEn: "Pick up loose change from the floor and low surfaces; the same for button batteries and rubber bands.",
    solution: "small_parts_bin",
  },
  "sports ball": {
    labelSr: "Lopta",
    labelEn: "Ball",
    category: "choking",
    severity: { "dog-large": "high", "dog-small": "medium" },
    whySr: "Lopta koja staje psu u zadnji deo ždrela može da mu zatvori disajni put usisavanjem. Veliki psi se guše loptama namenjenim malim rasama.",
    whyEn: "A ball that fits into the back of a dog's throat can seal the airway by suction. Large dogs choke on balls meant for small breeds.",
    statsSr: "Gušenje loptom je poznat uzrok iznenadne smrti kod velikih rasa (PDSA).",
    statsEn: "Ball choking is a known cause of sudden death in large breeds (PDSA).",
    fixSr: "Lopta mora biti veća od psećih usta — kod velikog psa nikad teniska.",
    fixEn: "The ball must be bigger than the dog's mouth — never a tennis ball for a large dog.",
  },
  "teddy bear": {
    labelSr: "Plišana igračka",
    labelEn: "Soft toy",
    category: "choking",
    severity: { ...DOGS("medium"), cat: "medium" },
    whySr: "Punjenje, oči i pištaljka se odvajaju i gutaju — to je najčešći sadržaj koji veterinar vadi iz creva.",
    whyEn: "Stuffing, eyes and squeakers come off and get swallowed — the most common thing a vet removes from an intestine.",
    statsSr: "Delovi igračaka su vodeći uzrok zapušenja creva kod pasa (PDSA).",
    statsEn: "Toy parts are a leading cause of intestinal obstruction in dogs (PDSA).",
    fixSr: "Bacite igračku čim popusti šav; nadgledajte igru sa plišanim igračkama.",
    fixEn: "Bin the toy as soon as a seam opens; supervise play with soft toys.",
  },
  plastic_bag: {
    labelSr: "Plastična kesa",
    labelEn: "Plastic bag",
    category: "choking",
    severity: ALL("high"),
    whySr: "Ljubimac gurne glavu u kesu za ostatkom hrane i ne ume da je skine — kesa se pri disanju zalepi za nozdrve.",
    whyEn: "A pet pushes its head into a bag after food scraps and cannot get it off — the bag seals over the nostrils when it breathes.",
    statsSr: "Gušenje kesom je čest, a potpuno sprečiv uzrok smrti ljubimaca (PDSA).",
    statsEn: "Bag suffocation is a common and entirely preventable cause of pet death (PDSA).",
    fixSr: "Kese držite u zatvorenoj fioci; presecite drške pre bacanja.",
    fixEn: "Keep bags in a closed drawer; cut the handles before binning them.",
  },
  // ── Struja i grizenje ──────────────────────────────────────────────────
  socket: {
    labelSr: "Utičnica i kablovi",
    labelEn: "Socket and cables",
    category: "electric",
    severity: { rabbit: "critical", rodent: "critical", cat: "high", bird: "high", "dog-small": "high", "dog-large": "medium" },
    whySr: "Zec i glodar gricaju sve što liči na koren — pregrizen kabl pod naponom pravi opekotine u ustima i vodeni edem pluća, koji ubija satima kasnije.",
    whyEn: "Rabbits and rodents gnaw anything root-shaped — a chewed live cable causes mouth burns and fluid on the lungs, which kills hours later.",
    statsSr: "Grizenje kablova je vodeći uzrok strujnog udara kod kućnih zečeva (PDSA).",
    statsEn: "Cable chewing is the leading cause of electric shock in pet rabbits (PDSA).",
    fixSr: "Uvucite kablove u zaštitnu cev i zatvorite utičnice. Za zeca ovo nije preporuka nego uslov.",
    fixEn: "Run cables through protective conduit and cover the sockets. For a rabbit this is a requirement, not advice.",
    solution: "cord_cover",
  },
  // ── Toplota i vatra ────────────────────────────────────────────────────
  stove: {
    labelSr: "Šporet",
    labelEn: "Cooker",
    category: "burn",
    severity: { cat: "critical", bird: "high", "dog-large": "medium" },
    whySr: "Mačka skače na radnu ploču dok je ringla još vrela i opeče šape; teflonski premaz zagrejan preko 260 °C oslobađa isparenja koja pticu ubijaju u minutima.",
    whyEn: "A cat jumps onto the worktop while the ring is still hot and burns its paws; non-stick coating heated above 260 °C releases fumes that kill a bird within minutes.",
    statsSr: "Isparenja pregrejanog teflona su poznat uzrok iznenadne smrti ptica u domaćinstvu (PDSA).",
    statsEn: "Overheated non-stick fumes are a known cause of sudden bird death in homes (PDSA).",
    fixSr: "Ne puštajte pticu u kuhinju dok se kuva. Za mačku: poklopci na ringle dok se hlade.",
    fixEn: "Keep birds out of the kitchen while cooking. For cats: hob covers while it cools.",
    solution: "hob_guard",
  },
  candle: {
    labelSr: "Sveća",
    labelEn: "Candle",
    category: "burn",
    severity: { cat: "high", bird: "high", "dog-large": "medium", "dog-small": "medium" },
    whySr: "Rep mačke prelazi preko plamena a da ona to ne primeti; oborena sveća pali stan. Mirisne sveće i difuzori sa eteričnim uljima truju mačku i preko kože.",
    whyEn: "A cat's tail passes through the flame without it noticing; a knocked-over candle sets the home alight. Scented candles and essential-oil diffusers poison cats through the skin as well.",
    statsSr: "Eterična ulja (čajno drvo, eukaliptus, citrus) su toksična za mačke jer im nedostaje enzim za razgradnju (ASPCA).",
    statsEn: "Essential oils (tea tree, eucalyptus, citrus) are toxic to cats, which lack the enzyme to break them down (ASPCA).",
    fixSr: "Koristite LED sveće. Difuzor sa eteričnim uljem izbacite iz stana u kom živi mačka.",
    fixEn: "Use LED candles. Remove essential-oil diffusers from a home with a cat.",
  },
  fireplace: {
    labelSr: "Kamin",
    labelEn: "Fireplace",
    category: "burn",
    severity: ALL("high"),
    whySr: "Ljubimac leže uz toplo staklo dok se ne opeče, jer bol od kontaktne opekotine oseti kasno. Varnica pali dlaku.",
    whyEn: "A pet lies against the hot glass until it burns, because contact-burn pain registers late. A spark catches fur.",
    statsSr: "Kontaktne opekotine od kamina su česte kod pasa i mačaka zimi (PDSA).",
    statsEn: "Fireplace contact burns are common in dogs and cats in winter (PDSA).",
    fixSr: "Postavite ogradu oko kamina, isto kao za dete.",
    fixEn: "Fit a guard around the fireplace, exactly as you would for a child.",
    solution: "fireplace_guard",
  },
  // ── Voda i pad ─────────────────────────────────────────────────────────
  toilet: {
    labelSr: "WC šolja",
    labelEn: "Toilet",
    category: "drowning",
    severity: { "dog-small": "high", cat: "medium", rodent: "high" },
    whySr: "Mali pas ili glodar upadne i ne može da se izvuče po glatkoj porcelanskoj ivici. Sredstvo za čišćenje u vodi truje i kad se samo pije.",
    whyEn: "A small dog or rodent falls in and cannot climb the smooth porcelain rim. Cleaning tablets in the water poison even if only drunk.",
    statsSr: "Utapanje u WC šolji je opisano kod pasa manjih rasa i mladunaca (PDSA).",
    statsEn: "Toilet drowning is documented in small-breed dogs and puppies (PDSA).",
    fixSr: "Držite dasku spuštenu i vrata kupatila zatvorena; izbacite tablete iz vodokotlića.",
    fixEn: "Keep the lid down and the bathroom door shut; stop using in-cistern tablets.",
    solution: "toilet_lock",
  },
  bathtub: {
    labelSr: "Kada",
    labelEn: "Bathtub",
    category: "drowning",
    severity: { "dog-small": "high", rodent: "high", cat: "medium" },
    whySr: "Puna kada bez nadzora je zamka: zidovi su glatki i strmi, a mokra dlaka je teška.",
    whyEn: "A full bath left unattended is a trap: the walls are smooth and steep, and wet fur is heavy.",
    statsSr: "Nadzor pri kupanju je osnovna preporuka za sve male ljubimce (PDSA).",
    statsEn: "Supervision during bathing is the basic recommendation for all small pets (PDSA).",
    fixSr: "Ispustite vodu odmah posle kupanja; ne ostavljajte ljubimca samog u kupatilu.",
    fixEn: "Drain the bath right after use; never leave a pet alone in the bathroom.",
  },
  // ── Penjanje, pad i prignječenje ───────────────────────────────────────
  stairs: {
    labelSr: "Stepenice",
    labelEn: "Stairs",
    category: "fall",
    severity: { "dog-small": "high", rabbit: "high", rodent: "high" },
    whySr: "Kod rasa sa dugim leđima (jazavičar, korgi) skakanje niz stepenice izaziva ispadanje diska. Zec koji padne niz stepenice lako slomi kičmu.",
    whyEn: "In long-backed breeds (dachshund, corgi) jumping down stairs causes disc herniation. A rabbit that falls down stairs easily breaks its spine.",
    statsSr: "Bolest intervertebralnog diska pogađa do jedne četvrtine jazavičara tokom života (PDSA).",
    statsEn: "Intervertebral disc disease affects up to a quarter of dachshunds in their lifetime (PDSA).",
    fixSr: "Postavite kapiju na stepenice i rampu na omiljeni kauč.",
    fixEn: "Fit a stair gate and a ramp to the favourite sofa.",
    solution: "stair_gate",
  },
  tv: {
    labelSr: "TV / visok nameštaj",
    labelEn: "TV / tall furniture",
    category: "crush",
    severity: CLIMBERS("high"),
    whySr: "Mačka skače na komodu i televizor se prevrne na nju. Uz to, mačka na prozoru bez mrežice skače za pticom — pad sa visine je poseban sindrom, čest u zgradama.",
    whyEn: "A cat jumps onto a unit and the TV topples onto it. And a cat at an unscreened window will leap after a bird — high-rise falls are a recognised syndrome in flats.",
    statsSr: "Sindrom pada sa visine — padovi mačaka sa balkona i prozora — čest je uzrok preloma u gradovima (WSAVA).",
    statsEn: "High-rise syndrome — cats falling from balconies and windows — is a common cause of fractures in cities (WSAVA).",
    fixSr: "Pričvrstite nameštaj i TV za zid, a na prozore i balkon stavite mrežicu za mačke.",
    fixEn: "Anchor furniture and the TV to the wall, and fit cat-proof netting on windows and the balcony.",
    solution: "window_net",
  },
  drawer: {
    labelSr: "Fioke i ormarići",
    labelEn: "Drawers and cupboards",
    category: "poisoning",
    severity: ALL("medium"),
    whySr: "Iza donjih vrata najčešće stoje hemija i lekovi. Mačka ume da otvori i klizna vrata, a pas da povuče fioku zubima.",
    whyEn: "Behind the low doors sit the chemicals and medicines. A cat can slide a door open, and a dog can pull a drawer with its teeth.",
    statsSr: "Ljudski lekovi su najčešća grupa otrova u pozivima za ljubimce (ASPCA).",
    statsEn: "Human medications are the single most common poison group in pet calls (ASPCA).",
    fixSr: "Bravice na donje fioke. Ibuprofen i paracetamol su za mačku smrtonosni u jednoj tableti.",
    fixEn: "Latches on the low drawers. Ibuprofen and paracetamol can kill a cat in a single tablet.",
    solution: "cabinet_lock",
  },
  // ── Grizenje i sitni predmeti ──────────────────────────────────────────
  book: {
    labelSr: "Knjige i papir",
    labelEn: "Books and paper",
    category: "choking",
    severity: CHEWERS("low"),
    whySr: "Zec i glodar gricaju papir i lepak sa poveza; veće količine prave zapušenje.",
    whyEn: "Rabbits and rodents gnaw paper and binding glue; larger amounts cause a blockage.",
    statsSr: "Neprikladan materijal za grickanje je čest razlog poremećaja varenja kod zečeva (PDSA).",
    statsEn: "Inappropriate chewing material is a common cause of digestive upset in rabbits (PDSA).",
    fixSr: "Podignite knjige sa donjih polica i ponudite seno i drvene grickalice.",
    fixEn: "Lift books off the bottom shelves and offer hay and wooden chews.",
  },
  remote: {
    labelSr: "Daljinski (baterije)",
    labelEn: "Remote (batteries)",
    category: "poisoning",
    severity: ALL("high"),
    whySr: "Pregrizena dugmasta baterija pravi hemijsku opekotinu jednjaka za nekoliko sati i to je hitan slučaj bez odlaganja.",
    whyEn: "A chewed button battery burns through the oesophagus within hours — an emergency with no waiting.",
    statsSr: "Dugmaste baterije izazivaju opekotine tkiva strujom već posle dva sata kontakta (ASPCA).",
    statsEn: "Button batteries cause electrical tissue burns after as little as two hours of contact (ASPCA).",
    fixSr: "Daljinske i sitnu elektroniku držite u fioci, ne na kauču.",
    fixEn: "Keep remotes and small electronics in a drawer, not on the sofa.",
  },
  scissors: {
    labelSr: "Makaze i konac",
    labelEn: "Scissors and thread",
    category: "cutting",
    severity: { cat: "high", ...DOGS("medium") },
    whySr: "Uz makaze skoro uvek stoji konac, a konac je za mačku najopasnija stvar u kući koja ne izgleda opasno.",
    whyEn: "Where there are scissors there is usually thread, and thread is the most dangerous harmless-looking thing in a cat's home.",
    statsSr: "Konac sa iglom je posebno težak slučaj — igla probija creva (WSAVA).",
    statsEn: "Thread with a needle is especially severe — the needle perforates the gut (WSAVA).",
    fixSr: "Pribor za šivenje u kutiju sa poklopcem, uvek i odmah posle upotrebe.",
    fixEn: "Sewing kit into a closed box, always and immediately after use.",
  },
  // ── Hrana sa stola ─────────────────────────────────────────────────────
  bowl: {
    labelSr: "Posuda sa hranom",
    labelEn: "Food bowl",
    category: "poisoning",
    severity: ALL("low"),
    whySr: "Luk, beli luk, grožđe i suvo grožđe su za psa i mačku otrovni i u malim količinama — grožđe izaziva otkazivanje bubrega.",
    whyEn: "Onion, garlic, grapes and raisins are toxic to dogs and cats even in small amounts — grapes cause kidney failure.",
    statsSr: "Grožđe i suvo grožđe izazivaju akutno otkazivanje bubrega kod pasa, bez poznate bezbedne doze (ASPCA).",
    statsEn: "Grapes and raisins cause acute kidney failure in dogs, with no known safe dose (ASPCA).",
    fixSr: "Ne dajte ostatke sa stola; posebno pazite na luk u kuvanim jelima.",
    fixEn: "No table scraps; watch especially for onion in cooked dishes.",
  },
  "wine glass": {
    labelSr: "Čaša sa pićem",
    labelEn: "Glass with a drink",
    category: "poisoning",
    severity: ALL("medium"),
    whySr: "Alkohol deluje na ljubimca višestruko jače nego na čoveka; već gutljaj izaziva pad šećera i telesne temperature.",
    whyEn: "Alcohol hits a pet far harder than a human; even a sip drops blood sugar and body temperature.",
    statsSr: "Etanol je za male ljubimce opasan u količinama koje čovek ne bi ni primetio (ASPCA).",
    statsEn: "Ethanol is dangerous to small pets in amounts a human would not notice (ASPCA).",
    fixSr: "Ne ostavljajte čaše na niskim stolovima bez nadzora.",
    fixEn: "Do not leave glasses on low tables unattended.",
  },
  // ── Drugi krug: klase koje detektor često vidi, a nisu bile pokrivene ──
  cup: {
    labelSr: "Šolja sa toplim napitkom",
    labelEn: "Cup with a hot drink",
    category: "burn",
    severity: { cat: "medium", "dog-small": "medium", bird: "high" },
    whySr: "Mačka gura šolju sa ivice, a ptica sleti na obod i opeče noge. Kofein je za ljubimca otrov i u malim količinama.",
    whyEn: "A cat pushes the cup off the edge, and a bird lands on the rim and burns its feet. Caffeine is a poison to pets even in small amounts.",
    statsSr: "Kofein izaziva ubrzan rad srca i grčeve kod pasa i mačaka (ASPCA).",
    statsEn: "Caffeine causes rapid heart rate and tremors in dogs and cats (ASPCA).",
    fixSr: "Ne ostavljajte tople napitke na ivici stola ni na radnoj ploči bez nadzora.",
    fixEn: "Do not leave hot drinks on table edges or worktops unattended.",
  },
  vase: {
    labelSr: "Vaza sa vodom",
    labelEn: "Vase with water",
    category: "poisoning",
    severity: { cat: "high", bird: "medium", "dog-small": "medium" },
    whySr: "Voda iz vaze u kojoj stoji ljiljan je za mačku otrovna i bez samog cveta. Vaza koju mačka obori se razbija.",
    whyEn: "Water from a vase holding a lily is toxic to a cat even without the flower itself. A vase a cat knocks over shatters.",
    statsSr: "Sve vrste pravih ljiljana i dnevnih ljiljana truju mačke, uključujući i vodu iz vaze (ASPCA).",
    statsEn: "All true lilies and daylilies poison cats, including the vase water (ASPCA).",
    fixSr: "Ako u vazi ima ljiljana, iznesite je iz stana. Ostale vaze na stabilnu površinu.",
    fixEn: "If the vase holds lilies, remove it from the home. Other vases onto a stable surface.",
  },
  knife: {
    labelSr: "Nož i pribor",
    labelEn: "Knife and cutlery",
    category: "cutting",
    severity: { cat: "medium", "dog-large": "medium", "dog-small": "low" },
    whySr: "Mačka na radnoj ploči gura nož ka ivici; pas liže masnoću sa oštrice i poseče jezik.",
    whyEn: "A cat on the worktop nudges a knife towards the edge; a dog licks fat off the blade and cuts its tongue.",
    statsSr: "Posekotine jezika od lizanja pribora česte su kod pasa (PDSA).",
    statsEn: "Tongue lacerations from licking cutlery are common in dogs (PDSA).",
    fixSr: "Pribor odmah u sudoperu pod vodu, ne na radnu ploču.",
    fixEn: "Cutlery straight into the sink under water, not onto the worktop.",
  },
  microwave: {
    labelSr: "Mikrotalasna / rerna",
    labelEn: "Microwave / oven",
    category: "burn",
    severity: { cat: "high", "dog-small": "medium" },
    whySr: "Mačka se uvlači u još toplu rernu jer je unutra mračno i toplo, i tu zaspi.",
    whyEn: "A cat climbs into a still-warm oven because it is dark and warm inside, and falls asleep there.",
    statsSr: "Uređaji sa otvorenim vratima su poznata zamka za mačke (Cats Protection).",
    statsEn: "Appliances left open are a known trap for cats (Cats Protection).",
    fixSr: "Držite vrata zatvorena i proverite unutrašnjost pre uključivanja.",
    fixEn: "Keep the doors shut and check inside before switching on.",
  },
  sink: {
    labelSr: "Sudopera",
    labelEn: "Sink",
    category: "poisoning",
    severity: ALL("medium"),
    whySr: "Ispod sudopere skoro uvek stoji hemija, a mačka ume da otvori i klizna vrata. Sudopera puna vode je zamka za sitne ljubimce.",
    whyEn: "Under the sink there is almost always household chemistry, and a cat can slide a door open. A sink full of water is a trap for small pets.",
    statsSr: "Sredstva za čišćenje su među najčešćim uzrocima trovanja ljubimaca u domu (ASPCA).",
    statsEn: "Cleaning products are among the most common household pet poisonings (ASPCA).",
    fixSr: "Bravica na vrata ispod sudopere; ne ostavljajte punu sudoperu.",
    fixEn: "A latch on the under-sink door; do not leave the sink full.",
    solution: "cabinet_lock",
  },
  chair: {
    labelSr: "Stolica",
    labelEn: "Chair",
    category: "fall",
    severity: { cat: "medium", "dog-small": "medium" },
    whySr: "Stolica uz radnu ploču je mačji put do šporeta, noževa i hrane. Fotelja na razvlačenje prignječi mačku koja spava u mehanizmu.",
    whyEn: "A chair by the worktop is a cat's route to the hob, the knives and the food. A recliner crushes a cat asleep in the mechanism.",
    statsSr: "Povrede u mehanizmu fotelje na razvlačenje opisane su kod mačaka i malih pasa (PDSA).",
    statsEn: "Recliner mechanism injuries are documented in cats and small dogs (PDSA).",
    fixSr: "Gurnite stolice pod sto; proverite fotelju pre nego što je sklopite.",
    fixEn: "Push chairs under the table; check the recliner before folding it.",
  },
  "dining table": {
    labelSr: "Sto sa hranom",
    labelEn: "Table with food",
    category: "poisoning",
    severity: { ...DOGS("medium"), cat: "medium" },
    whySr: "Grožđe, luk, čokolada i kosti sa stola su najčešći razlog hitnog odlaska kod veterinara posle praznika.",
    whyEn: "Grapes, onion, chocolate and bones from the table are the most common reason for an emergency vet visit after a holiday.",
    statsSr: "Broj poziva zbog trovanja ljubimaca skače tokom praznika (ASPCA).",
    statsEn: "Pet poisoning calls spike over holiday periods (ASPCA).",
    fixSr: "Ne ostavljajte hranu na stolu bez nadzora; kuvane kosti nikad.",
    fixEn: "Never leave food on the table unattended; never cooked bones.",
  },
  couch: {
    labelSr: "Kauč",
    labelEn: "Sofa",
    category: "fall",
    severity: { "dog-small": "medium", rabbit: "medium" },
    whySr: "Skok sa kauča je kod rasa sa dugim leđima čest uzrok ispadanja diska, a kod zeca preloma.",
    whyEn: "Jumping off the sofa is a common cause of disc herniation in long-backed breeds, and of fractures in rabbits.",
    statsSr: "Ponovljeni skokovi sa nameštaja opterećuju kičmu jazavičara i sličnih rasa (PDSA).",
    statsEn: "Repeated jumps off furniture strain the spine of dachshunds and similar breeds (PDSA).",
    fixSr: "Postavite rampu ili stepenik do omiljenog mesta.",
    fixEn: "Fit a ramp or a step up to the favourite spot.",
  },
  laptop: {
    labelSr: "Punjač i kablovi",
    labelEn: "Charger and cables",
    category: "electric",
    severity: { rabbit: "critical", rodent: "critical", cat: "medium", "dog-small": "medium" },
    whySr: "Punjač je za zeca i glodara isto što i koren — pregrizen kabl pod naponom pravi opekotine u ustima i edem pluća.",
    whyEn: "A charger is root-shaped to a rabbit or rodent — a chewed live cable causes mouth burns and fluid on the lungs.",
    statsSr: "Grizenje kablova je vodeći uzrok strujnog udara kod kućnih zečeva (PDSA).",
    statsEn: "Cable chewing is the leading cause of electric shock in pet rabbits (PDSA).",
    fixSr: "Uvucite kablove u zaštitnu cev ili ih podignite van domašaja.",
    fixEn: "Run cables through protective tubing or lift them out of reach.",
    solution: "cord_cover",
  },
  "cell phone": {
    labelSr: "Sitna elektronika",
    labelEn: "Small electronics",
    category: "poisoning",
    severity: ALL("medium"),
    whySr: "Litijumska baterija koju ljubimac pregrize pravi hemijsku opekotinu jednjaka za nekoliko sati.",
    whyEn: "A lithium battery a pet bites through burns the oesophagus chemically within hours.",
    statsSr: "Dugmaste baterije oštećuju tkivo već posle dva sata kontakta (ASPCA).",
    statsEn: "Button batteries damage tissue after as little as two hours of contact (ASPCA).",
    fixSr: "Sitnu elektroniku držite u fioci, ne na kauču i podu.",
    fixEn: "Keep small electronics in a drawer, not on the sofa or floor.",
  },
  handbag: {
    labelSr: "Torba na podu",
    labelEn: "Bag on the floor",
    category: "poisoning",
    severity: ALL("high"),
    whySr: "U torbi su lekovi, žvake sa ksilitolom i slatkiši — pas je otvori za trideset sekundi dok nikoga nema.",
    whyEn: "A bag holds medicines, xylitol chewing gum and sweets — a dog opens it in thirty seconds while nobody is there.",
    statsSr: "Ljudski lekovi su najčešća grupa otrova u pozivima za ljubimce (ASPCA).",
    statsEn: "Human medications are the most common poison group in pet calls (ASPCA).",
    fixSr: "Torbu okačite, nikad na pod ni na nisku stolicu.",
    fixEn: "Hang the bag up, never on the floor or a low chair.",
  },
  toaster: {
    labelSr: "Toster i gajtan",
    labelEn: "Toaster and cord",
    category: "burn",
    severity: { cat: "medium", "dog-large": "medium" },
    whySr: "Gajtan koji visi sa radne ploče povuče vreo uređaj na ljubimca ispod.",
    whyEn: "A cord hanging from the worktop pulls the hot appliance down onto the pet below.",
    statsSr: "Povlačenje uređaja za gajtan je čest uzrok opekotina u kuhinji (PDSA).",
    statsEn: "Pulling appliances down by the cord is a common kitchen burn cause (PDSA).",
    fixSr: "Skratite gajtan i gurnite uređaj dalje od ivice.",
    fixEn: "Shorten the cord and push the appliance back from the edge.",
    solution: "cord_cover",
  },
  kettle: {
    labelSr: "Čajnik",
    labelEn: "Kettle",
    category: "burn",
    severity: { cat: "high", "dog-large": "medium" },
    whySr: "Mačka na radnoj ploči obori čajnik sa ključalom vodom; opekotine od prolivene vrele tečnosti su najteže.",
    whyEn: "A cat on the worktop knocks over a kettle of boiling water; scald burns are the most severe.",
    statsSr: "Opekotine vrelom tečnošću zahtevaju dugotrajno lečenje kod ljubimaca (PDSA).",
    statsEn: "Scald burns require prolonged treatment in pets (PDSA).",
    fixSr: "Čajnik dalje od ivice, gajtan skraćen.",
    fixEn: "Kettle back from the edge, cord shortened.",
  },
  clock: {
    labelSr: "Predmet na polici",
    labelEn: "Object on a shelf",
    category: "crush",
    severity: CLIMBERS("medium"),
    whySr: "Mačka hoda po polici i obara sve što na njoj stoji — na sebe ili na ljubimca ispod.",
    whyEn: "A cat walks along the shelf and knocks off whatever stands there — onto itself or a pet below.",
    statsSr: "Padajući predmeti su čest uzrok povreda kod mačaka koje se penju (WSAVA).",
    statsEn: "Falling objects are a common injury cause in climbing cats (WSAVA).",
    fixSr: "Teške i staklene predmete sklonite sa polica po kojima mačka prolazi.",
    fixEn: "Move heavy and glass objects off the shelves the cat walks along.",
  },
  // ── Zatvoreni prostori u kojima ljubimac zaspi ─────────────────────────
  refrigerator: {
    labelSr: "Mašina / veliki uređaj",
    labelEn: "Machine / large appliance",
    category: "crush",
    severity: { cat: "critical", "dog-small": "medium" },
    whySr: "Mačka ulazi u mašinu za veš i sušilicu jer je toplo i mračno, pa zaspi. Naviku da se pre uključivanja proveri bubanj treba steći odmah.",
    whyEn: "Cats climb into washing machines and dryers because they are warm and dark, and fall asleep there. The habit of checking the drum before switching on must start immediately.",
    statsSr: "Smrt mačke u mašini za veš je redovna, a potpuno sprečiva nesreća (Cats Protection).",
    statsEn: "Cat deaths in washing machines are a regular and entirely preventable accident (Cats Protection).",
    fixSr: "Držite vrata mašine zatvorena i proverite bubanj pre svakog pranja.",
    fixEn: "Keep the machine door shut and check the drum before every wash.",
  },
};

/** Ima li baza znanja pravilo za ovu klasu detektora. */
export function petRuleFor(cocoClass: string): PetRule | undefined {
  return PET_RULES[cocoClass];
}
