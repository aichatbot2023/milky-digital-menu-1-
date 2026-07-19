/**
 * Baza znanja: COCO klase (YOLO detekcija) → opasnosti po decu.
 * Ozbiljnost se prilagođava uzrastu. Statistike su opšte epidemiološke
 * činjenice sa izvorom — bez izmišljenih brojeva.
 */
import type { AgeGroup, Hazard, HazardCategory, Severity } from "../types";

export interface Detection {
  label: string;
  score: number;
  box: { x: number; y: number; w: number; h: number };
}

interface HazardRule {
  labelSr: string;
  category: HazardCategory;
  /** Ozbiljnost po grupi uzrasta; ako grupa nije navedena, objekat se ne prijavljuje za nju. */
  severity: Partial<Record<AgeGroup, Severity>>;
  why: string;
  stats: string;
  fix: string;
}

const YOUNG: AgeGroup[] = ["0-6m", "6-12m", "1-2y", "2-4y"];
const ALL: AgeGroup[] = ["0-6m", "6-12m", "1-2y", "2-4y", "4-7y", "7y+"];

function sev(groups: AgeGroup[], s: Severity): Partial<Record<AgeGroup, Severity>> {
  return Object.fromEntries(groups.map((g) => [g, s]));
}

const RULES: Record<string, HazardRule> = {
  knife: {
    labelSr: "Nož",
    category: "cutting",
    severity: { ...sev(ALL, "high"), ...sev(["6-12m", "1-2y", "2-4y"], "critical") },
    why: "Oštar predmet u dometu deteta. Deca koja dohvataju i penju se mogu da ga zgrabe za sečivo ili povuku sa površine.",
    stats: "Posekotine su među najčešćim povredama male dece u kuhinji; oštri predmeti su vodeći uzrok posekotina koje zahtevaju šivenje (CDC).",
    fix: "Odmah sklonite nož u fioku sa bravicom za decu ili na visinu van domašaja.",
  },
  scissors: {
    labelSr: "Makaze",
    category: "cutting",
    severity: { ...sev(ALL, "medium"), ...sev(["1-2y", "2-4y"], "high") },
    why: "Makaze u dometu deteta — rizik od posekotina prstiju i lica, posebno kod dece koja imitiraju odrasle.",
    stats: "Povrede oštrim kućnim predmetima čine značajan deo poseta hitnoj pomoći dece 1–4 godine (EU Child Safety Alliance).",
    fix: "Čuvajte makaze u zatvorenoj fioci; za stariju decu koristite dečje makaze sa tupim vrhom.",
  },
  fork: {
    labelSr: "Viljuška",
    category: "cutting",
    severity: sev(["6-12m", "1-2y", "2-4y"], "medium"),
    why: "Oštri zupci mogu povrediti usta i oko ako dete padne sa viljuškom u ruci ili je povuče sa stola.",
    stats: "Povrede priborom za jelo najčešće se dešavaju kod dece do 4 godine za vreme obroka (CDC).",
    fix: "Držite pribor dalje od ivice stola; koristite dečji pribor sa zaobljenim vrhovima.",
  },
  bottle: {
    labelSr: "Flaša",
    category: "poisoning",
    severity: sev(YOUNG, "medium"),
    why: "Flaše mogu sadržati tečnosti opasne za dete (hemikalije, alkohol) ili se razbiti. Deca do 3 godine sve probaju ustima.",
    stats: "Trovanja u domu su među vodećim uzrocima poziva centrima za kontrolu trovanja za decu do 5 godina (SZO).",
    fix: "Proverite sadržaj; hemikalije i alkohol uvek u zaključan ormarić, staklo van domašaja.",
  },
  "wine glass": {
    labelSr: "Staklena čaša",
    category: "cutting",
    severity: sev(YOUNG, "high"),
    why: "Staklo na dohvat deteta — lako se prevrne i razbije, a krhotine izazivaju duboke posekotine.",
    stats: "Razbijeno staklo je čest uzrok posekotina male dece u domaćinstvu (EU Child Safety Alliance).",
    fix: "Zamenite plastičnim čašama dok je dete malo; staklo sklanjajte odmah posle upotrebe.",
  },
  cup: {
    labelSr: "Šolja",
    category: "burn",
    severity: sev(YOUNG, "high"),
    why: "Šolja može sadržati vruć napitak — dete povlači stolnjak ili dohvata ivicu stola i prosipa vrelu tečnost na sebe.",
    stats: "Opekotine vrelim napicima su najčešći tip opekotina kod dece do 4 godine (SZO).",
    fix: "Vruće napitke držite na sredini stola, bez stolnjaka koji dete može povući; nikad vruće piće u ruci dok držite dete.",
  },
  bowl: {
    labelSr: "Činija",
    category: "burn",
    severity: sev(["6-12m", "1-2y"], "medium"),
    why: "Činija sa vrućom hranom blizu ivice — dete može da je prevrne na sebe.",
    stats: "Vruća hrana i tečnosti uzrokuju većinu opekotina male dece u kuhinji (SZO).",
    fix: "Pomerite dublje na radnu površinu/sto, dalje od ivice.",
  },
  vase: {
    labelSr: "Vaza",
    category: "crush",
    severity: sev(YOUNG, "medium"),
    why: "Teška ili staklena vaza može pasti na dete koje se pridržava za nameštaj ili povuče podlogu na kojoj stoji.",
    stats: "Padajući predmeti sa nameštaja česti su uzrok povreda glave kod dece koja prohodavaju (CDC).",
    fix: "Premestite vazu na stabilnu, visoku površinu daleko od ivice.",
  },
  "potted plant": {
    labelSr: "Saksija sa biljkom",
    category: "poisoning",
    severity: sev(YOUNG, "medium"),
    why: "Neke sobne biljke su otrovne pri žvakanju lišća, a zemlja i saksija mogu završiti na detetu pri prevrtanju.",
    stats: "Biljke su među 10 najčešćih uzroka poziva centrima za trovanja za malu decu (SZO).",
    fix: "Proverite da li je biljka otrovna (fikus, difenbahija...); podignite je van domašaja.",
  },
  oven: {
    labelSr: "Rerna/šporet",
    category: "burn",
    severity: { ...sev(ALL, "medium"), ...sev(["1-2y", "2-4y"], "high") },
    why: "Vrata rerne i ringle ostaju vreli dugo posle upotrebe; dete u visini vrata rerne može da se nasloni ili dohvati ručke šerpi.",
    stats: "Kontaktne opekotine od šporeta i rerne su među najčešćim opekotinama dece 1–4 godine (SZO).",
    fix: "Montirajte zaštitu za šporet i zaštitna vrata/bravu za rernu; ručke šerpi okrećite ka unutra.",
  },
  microwave: {
    labelSr: "Mikrotalasna",
    category: "burn",
    severity: sev(["2-4y", "4-7y"], "medium"),
    why: "Deca mogu sama da zagreju hranu/tečnost do ključanja — para i pregrejane tečnosti izazivaju opekotine.",
    stats: "Opekotine parom i pregrejanim tečnostima iz mikrotalasne rastu kod dece od 4+ godine (CDC).",
    fix: "Postavite mikrotalasnu van domašaja; naučite starije dete pravilima zagrevanja.",
  },
  toaster: {
    labelSr: "Toster",
    category: "burn",
    severity: sev(["1-2y", "2-4y"], "medium"),
    why: "Vrele površine i kabl koji visi — dete može povući toster sa radne površine.",
    stats: "Mali kuhinjski aparati sa visećim kablom čest su uzrok opekotina prevrtanjem (EU Child Safety Alliance).",
    fix: "Sklonite kabl da ne visi preko ivice; toster gurnite dalje od ivice radne površine.",
  },
  tv: {
    labelSr: "Televizor",
    category: "crush",
    severity: { ...sev(["6-12m", "1-2y", "2-4y"], "high") },
    why: "Dete koje se pridržava ili penje može prevrnuti TV na sebe — pad ekrana na dete izaziva teške povrede glave.",
    stats: "Prevrtanje TV-a i nameštaja šalje jedno dete u hitnu pomoć svakih ~30 minuta (podaci CPSC/CDC za SAD).",
    fix: "Pričvrstite TV na zid nosačem ili sigurnosnim trakama protiv prevrtanja.",
  },
  laptop: {
    labelSr: "Laptop sa kablom",
    category: "electric",
    severity: sev(YOUNG, "low"),
    why: "Kabl punjača je lako dohvatljiv — povlačenjem laptop pada, a utičnica i kabl su rizik za žvakanje.",
    stats: "Povrede strujom kod male dece najčešće nastaju preko kablova i utičnica u visini poda (SZO).",
    fix: "Punite uređaje van domašaja; koristite zaštitne poklopce za utičnice.",
  },
  "cell phone": {
    labelSr: "Punjač/telefon",
    category: "electric",
    severity: sev(["6-12m", "1-2y"], "low"),
    why: "Kabl punjača u ustima deteta uz uključenu utičnicu je rizik od povrede strujom.",
    stats: "Gutanje/žvakanje kablova prijavljeno je kao čest razlog intervencija kod dece do 2 godine (CDC).",
    fix: "Isključite punjač iz utičnice kad se ne koristi; kabl van domašaja.",
  },
  chair: {
    labelSr: "Stolica",
    category: "fall",
    severity: sev(["1-2y", "2-4y"], "medium"),
    why: "Stolica je 'merdevina' za dete — penjanjem dohvata sto, radnu površinu ili prozor.",
    stats: "Padovi su uzrok br. 1 nefatalnih povreda dece 0–4 godine (~44% poseta hitnoj — CDC).",
    fix: "Gurnite stolice uz sto; ne ostavljajte ih uz prozore, šporet ili radne površine.",
  },
  "dining table": {
    labelSr: "Sto — ivice",
    category: "fall",
    severity: sev(["6-12m", "1-2y", "2-4y"], "medium"),
    why: "Ivica stola je u visini glave deteta koje prohodava; stolnjak koji visi može povući sve sa stola na dete.",
    stats: "Udarci o ivice nameštaja su među najčešćim povredama glave dece 1–3 godine (EU Child Safety Alliance).",
    fix: "Postavite gumene štitnike na uglove; izbegavajte stolnjake dok je dete malo.",
  },
  couch: {
    labelSr: "Kauč",
    category: "fall",
    severity: sev(["0-6m", "6-12m"], "medium"),
    why: "Beba ostavljena na kauču može da se prevrne i padne; jastuci uz lice bebe su rizik gušenja.",
    stats: "Padovi sa nameštaja su najčešći uzrok povreda beba do 12 meseci (CDC).",
    fix: "Ne ostavljajte bebu samu na kauču ni na trenutak; presvlačite je na podu ili u krevecu.",
  },
  bed: {
    labelSr: "Krevet",
    category: "fall",
    severity: sev(["0-6m", "6-12m", "1-2y"], "medium"),
    why: "Pad sa kreveta za odrasle je čest kod beba i male dece; posteljina i jastuci su rizik gušenja za bebe.",
    stats: "Padovi sa kreveta čine veliki deo povreda glave kod dece do 2 godine (SZO).",
    fix: "Beba spava u krevecu sa ogradicom; za veće dete montirajte zaštitnu ogradicu za krevet.",
  },
  sink: {
    labelSr: "Sudopera/lavabo",
    category: "drowning",
    severity: sev(["1-2y", "2-4y"], "medium"),
    why: "Voda i hemikalije ispod sudopere; dete se penje da dohvati slavinu — rizik od opekotina vrelom vodom.",
    stats: "Vrela voda iz slavine uzrok je ozbiljnih opekotina male dece; preporuka SZO je bojler ≤ 50°C.",
    fix: "Hemikalije iz ormarića ispod sudopere premestite ili zaključajte; ograničite temperaturu bojlera.",
  },
  toilet: {
    labelSr: "WC šolja",
    category: "drowning",
    severity: sev(["6-12m", "1-2y"], "medium"),
    why: "Dete koje se naginje u WC šolju može izgubiti ravnotežu — malo vode je dovoljno za davljenje malog deteta.",
    stats: "Davljenje je moguće u samo 5 cm vode; kupatilo je rizična zona za decu do 3 godine (SZO).",
    fix: "Montirajte bravicu za WC dasku i držite vrata kupatila zatvorena.",
  },
  refrigerator: {
    labelSr: "Frižider",
    category: "crush",
    severity: sev(["1-2y", "2-4y"], "low"),
    why: "Prignječenje prstiju vratima i dohvatanje staklenih tegli sa polica pri otvaranju.",
    stats: "Prignječenja prstiju vratima su među čestim manjim povredama male dece u domu (EU Child Safety Alliance).",
    fix: "Postavite bravicu za frižider ako dete samo otvara vrata.",
  },
  book: {
    labelSr: "Police/knjige",
    category: "crush",
    severity: sev(["1-2y", "2-4y"], "low"),
    why: "Ako su knjige na polici koja nije pričvršćena, dete koje se penje može prevrnuti celu policu.",
    stats: "Prevrtanje nameštaja (police, komode) izaziva teške povrede dece koja se penju (CPSC/CDC).",
    fix: "Pričvrstite police i komode na zid protiv prevrtanja.",
  },
  remote: {
    labelSr: "Daljinski (baterije!)",
    category: "choking",
    severity: { ...sev(YOUNG, "high"), ...sev(["6-12m", "1-2y"], "critical") },
    why: "Daljinski upravljači sadrže dugmaste baterije — ako dete otvori poklopac i proguta bateriju, ona za 2 sata izaziva teške hemijske opekotine jednjaka.",
    stats: "Gutanje dugmastih baterija je hitno stanje; broj teških slučajeva kod dece do 6 godina višestruko je porastao poslednjih godina (CDC/poison centri).",
    fix: "Proverite da je poklopac baterija pričvršćen šrafom ili trakom; daljinski držite van domašaja.",
  },
  "sports ball": {
    labelSr: "Loptica",
    category: "choking",
    severity: sev(["0-6m", "6-12m", "1-2y", "2-4y"], "medium"),
    why: "Male lopte i njihovi delovi mogu zapušiti disajne puteve — sve što prođe kroz rolnu toalet papira je rizik gušenja za dete do 3 godine.",
    stats: "Gušenje malim predmetima vodeći je uzrok smrti od nesreća kod dece mlađe od 1 godine (CDC).",
    fix: "Lopte prečnika manjeg od 4,5 cm sklonite dok je dete malo; proveravajte igračke starije braće/sestara.",
  },
  "teddy bear": {
    labelSr: "Plišana igračka",
    category: "choking",
    severity: sev(["0-6m"], "medium"),
    why: "Plišane igračke u krevecu bebe su rizik gušenja tokom spavanja; plastične oči/nosevi koji se otkače su rizik gutanja.",
    stats: "Meki predmeti u krevecu povezani su sa sindromom iznenadne smrti odojčeta — preporuka je prazan krevetac (AAP/SZO).",
    fix: "Krevetac bebe do 12 meseci treba da bude prazan: bez plišanih igračaka, jastuka i ćebadi.",
  },
  handbag: {
    labelSr: "Tašna (sadržaj!)",
    category: "poisoning",
    severity: sev(YOUNG, "high"),
    why: "Tašne tipično sadrže lekove, sitninu, upaljače i kozmetiku — sve što dete istrese i stavi u usta. Radoznalost + niska visina tašne = čest scenario trovanja.",
    stats: "Lekovi iz tašni baka/gostiju čest su uzrok slučajnih trovanja dece do 5 godina (poison centri, CDC).",
    fix: "Tašne (svoje i gostiju) kačite visoko ili sklanjajte iza zatvorenih vrata, nikad na pod ili kauč.",
  },
  backpack: {
    labelSr: "Ranac (sadržaj)",
    category: "poisoning",
    severity: sev(YOUNG, "medium"),
    why: "Ranci sadrže sitne predmete, flašice, lekove ili makaze; kaiševi su rizik zaplitanja.",
    stats: "Slučajna trovanja i gušenja sitnicama najčešće nastaju predmetima ostavljenim u torbama u visini deteta (CDC).",
    fix: "Rance držite zakačene na visini; proverite šta stariji ukućani nose u njima.",
  },
  suitcase: {
    labelSr: "Kofer",
    category: "crush",
    severity: sev(["1-2y", "2-4y"], "low"),
    why: "Uspravan kofer se lako prevrne na dete koje se pridržava; točkovi i rajsferšlusi štipaju prste.",
    stats: "Povrede prevrtanjem predmeta na točkovima česte su kod dece koja prohodavaju (EU Child Safety Alliance).",
    fix: "Kofer polegnite ili sklonite u plakar posle putovanja.",
  },
  umbrella: {
    labelSr: "Kišobran",
    category: "cutting",
    severity: sev(["1-2y", "2-4y", "4-7y"], "medium"),
    why: "Vrhovi žica i mehanizam za otvaranje mogu ubosti oko ili prignječiti prste; automatsko otvaranje u lice je čest scenario.",
    stats: "Povrede oka šiljatim kućnim predmetima najčešće su kod dece 2–7 godina (EU Child Safety Alliance).",
    fix: "Držite kišobrane zatvorene i van domašaja, u stalku ili na čiviluku.",
  },
  tie: {
    labelSr: "Kravata/traka",
    category: "strangulation",
    severity: sev(["0-6m", "6-12m", "1-2y", "2-4y"], "high"),
    why: "Sve trake, kravate i gajtani duži od 20 cm su rizik davljenja — dete ih omota oko vrata ili se zaplete tokom igre/spavanja.",
    stats: "Davljenje trakama i gajtanima (uklj. gajtane roletni) uzrokuje smrtne slučajeve dece do 4 godine svake godine (CPSC).",
    fix: "Sklonite trake i gajtane van domašaja; gajtane roletni skratite ili zamenite bezgajtanskim.",
  },
  "hair drier": {
    labelSr: "Fen za kosu",
    category: "electric",
    severity: { ...sev(["1-2y", "2-4y"], "high"), ...sev(["4-7y"], "medium") },
    why: "Fen uključen u struju pored vode (lavabo, kada) je rizik strujnog udara; vrela rešetka fena izaziva kontaktne opekotine.",
    stats: "Kupatilo je najrizičnija prostorija za povrede strujom u domu; uređaji pored vode su vodeći uzrok (SZO).",
    fix: "Isključite fen iz utičnice odmah posle upotrebe i sklonite ga; nikad ga ne ostavljajte pored kade/lavaboa.",
  },
  dog: {
    labelSr: "Pas",
    category: "other",
    severity: sev(["0-6m", "6-12m", "1-2y"], "medium"),
    why: "Ni najmirniji pas ne sme biti sam sa bebom/malim detetom — dete ne ume da pročita signale upozorenja, a većina ujeda dece dolazi od poznatog psa.",
    stats: "Deca do 4 godine najčešće su žrtve ujeda pasa, tipično od porodičnog psa u domu (CDC).",
    fix: "Nikada ne ostavljajte dete i psa bez nadzora u istoj prostoriji; naučite dete da ne dira psa dok jede/spava.",
  },
  cat: {
    labelSr: "Mačka",
    category: "other",
    severity: sev(["0-6m", "6-12m"], "low"),
    why: "Mačka može da legne uz lice bebe koja spava (rizik disanja) ili ogrebe dete koje je vuče.",
    stats: "Ogrebotine i ujedi mačaka kod male dece nose rizik infekcije i najčešći su kod dece koja tek uče kontakt sa životinjama (CDC).",
    fix: "Držite mačku van sobe u kojoj beba spava; naučite dete nežnom kontaktu.",
  },
  "hot dog": {
    labelSr: "Viršla/hrana",
    category: "choking",
    severity: { ...sev(["6-12m", "1-2y", "2-4y"], "critical") },
    why: "Viršla je oblikom i prečnikom idealan čep za dečji disajni put — vodeći je pojedinačni uzrok fatalnog gušenja hranom kod dece.",
    stats: "Viršle uzrokuju najviše smrtnih gušenja hranom kod dece do 3 godine (AAP/CDC).",
    fix: "Secite viršle PO DUŽINI pa na male komade; dete uvek jede sedeći i pod nadzorom.",
  },
  apple: {
    labelSr: "Tvrdo voće (komadi)",
    category: "choking",
    severity: sev(["6-12m", "1-2y", "2-4y"], "medium"),
    why: "Tvrdi komadi jabuke (i sirovog povrća) lako zapuše disajni put deteta koje još nema kutnjake za žvakanje.",
    stats: "Tvrda hrana (jabuka, šargarepa, orasi) među najčešćim je uzrocima gušenja dece do 4 godine (AAP).",
    fix: "Rendajte ili kuvajte tvrdo voće/povrće za decu do 4 godine; secite na trake, ne kolutove.",
  },
  orange: {
    labelSr: "Voće (komadi)",
    category: "choking",
    severity: sev(["6-12m", "1-2y"], "low"),
    why: "Opne i veći komadi citrusa mogu izazvati davljenje kod dece koja tek uče da žvaću.",
    stats: "Gušenje hranom najčešće je kod dece 6 meseci – 3 godine (AAP).",
    fix: "Uklonite opne i secite na male komade; dete jede sedeći, uz nadzor.",
  },
  carrot: {
    labelSr: "Sirova šargarepa",
    category: "choking",
    severity: sev(["6-12m", "1-2y", "2-4y"], "medium"),
    why: "Sirova šargarepa je tvrda i lomi se u komade savršene veličine da zapuše dečji disajni put.",
    stats: "Sirovo tvrdo povrće je u vrhu liste namirnica koje izazivaju gušenje male dece (AAP).",
    fix: "Kuvajte ili rendajte šargarepu za decu do 4 godine.",
  },
  clock: {
    labelSr: "Sat (baterije)",
    category: "choking",
    severity: sev(["6-12m", "1-2y", "2-4y"], "medium"),
    why: "Stoni satovi sadrže baterije (često dugmaste) i staklo; pad sata sa police na dete je dodatni rizik.",
    stats: "Dugmaste baterije iz kućnih uređaja su među najopasnijim predmetima za gutanje (poison centri).",
    fix: "Satove držite visoko i proverite da su poklopci baterija sigurni.",
  },
  "baseball bat": {
    labelSr: "Palica/štap",
    category: "crush",
    severity: sev(["1-2y", "2-4y", "4-7y"], "low"),
    why: "Teški sportski rekviziti oslonjeni o zid padaju kad ih dete povuče; zamah starije dece pogađa mlađu.",
    stats: "Povrede sportskim rekvizitima u domu najčešće pogađaju mlađu braću/sestre (CPSC).",
    fix: "Sportsku opremu držite u ormanu ili stalku, ne oslonjenu o zid.",
  },
  skateboard: {
    labelSr: "Skejtbord",
    category: "fall",
    severity: sev(["1-2y", "2-4y", "4-7y"], "medium"),
    why: "Dete koje stane na skejt u kući pada unazad na tvrdu podlogu — tipičan mehanizam povrede glave.",
    stats: "Padovi na točkićima (skejt, romobil) bez kacige česti su uzrok povreda glave dece (CDC).",
    fix: "Sklonite skejt/romobil iz prostora gde se dete igra; napolju uvek kaciga.",
  },
  bicycle: {
    labelSr: "Bicikl",
    category: "fall",
    severity: sev(["1-2y", "2-4y"], "low"),
    why: "Bicikl oslonjen o zid pada na dete koje ga povuče; lanac i zupčanici štipaju prste.",
    stats: "Prignječenja prstiju mehanizmima bicikla česta su kod male dece (EU Child Safety Alliance).",
    fix: "Parkirajte bicikl na nožicu ili držač, dalje od prostora za igru.",
  },
};

export function mapDetectionsToHazards(
  detections: Detection[],
  ageGroup: AgeGroup,
): Hazard[] {
  const hazards: Hazard[] = [];
  const perLabel = new Map<string, number>();
  for (const d of detections) {
    const rule = RULES[d.label];
    if (!rule) continue;
    const severity = rule.severity[ageGroup];
    if (!severity) continue; // nije rizik za ovaj uzrast
    // Jedan tip objekta prijavi najviše 3 puta da overlay ne bude pretrpan
    const count = perLabel.get(d.label) ?? 0;
    if (count >= 3) continue;
    perLabel.set(d.label, count + 1);
    // Nesiguran nalaz se JASNO obeležava — ne tvrdimo ono što model nagađa
    // (npr. bebeća flašica ≠ čaša); roditelj ocenom 👎 uči aplikaciju.
    const uncertain = d.score < 0.55;
    hazards.push({
      id: `local-${hazards.length}-${d.label.replace(/\s/g, "_")}`,
      label: uncertain ? `Moguće: ${rule.labelSr}` : rule.labelSr,
      category: rule.category,
      severity,
      box: d.box,
      why: rule.why,
      stats: rule.stats,
      fix: rule.fix,
      resolved: false,
      sourceClass: d.label,
      confidence: d.score,
    });
  }
  // Kritične prve
  const order: Severity[] = ["critical", "high", "medium", "low"];
  return hazards.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

/**
 * Odgovor asistenta BEZ interneta: kada cloud "mozak" nije dostupan,
 * odgovaramo iz lokalne baze znanja i konteksta poslednjeg skena —
 * dugme asistenta uvek funkcioniše.
 */
export function offlineAssistantAnswer(question: string, hazards: Hazard[]): string {
  const q = question.toLowerCase();
  // 1) Pitanje o konkretnoj uočenoj opasnosti → njen "zašto" + rešenje
  for (const h of hazards) {
    const words = h.label.toLowerCase().split(/[\s/(),—-]+/).filter((w) => w.length > 3);
    if (words.some((w) => q.includes(w))) {
      return `${h.why} Rešenje: ${h.fix}`;
    }
  }
  // 2) Opšte pitanje uz postojeći sken → tri najvažnija koraka
  if (hazards.length > 0) {
    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const top = [...hazards]
      .sort((a, b) => order[a.severity] - order[b.severity])
      .slice(0, 3);
    return (
      "Evo najvažnijih koraka na osnovu skena: " +
      top.map((h, i) => `${i + 1}. ${h.label} — ${h.fix}`).join(" ")
    );
  }
  // 3) Bez skena → osnovni saveti
  return "Najvažnije zone za proveru: utičnice (zaštitni poklopci), gajtani roletni i kablovi (davljenje), sitni predmeti i baterije (gušenje), hemikalije i lekovi (zaključati), šporet i vrele tečnosti, prozori i stepenice (zaštitne ograde). Skenirajte prostor kamerom pa me pitajte za detalje.";
}
