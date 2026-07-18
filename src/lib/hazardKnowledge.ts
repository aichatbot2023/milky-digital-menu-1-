/**
 * Baza znanja: COCO klase (YOLO detekcija) → opasnosti po decu.
 * Ozbiljnost se prilagođava uzrastu. Statistike su opšte epidemiološke
 * činjenice sa izvorom — bez izmišljenih brojeva.
 */
import type { AgeGroup, Hazard, HazardCategory, Severity } from "../types";

interface Detection {
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
};

export function mapDetectionsToHazards(
  detections: Detection[],
  ageGroup: AgeGroup,
): Hazard[] {
  const hazards: Hazard[] = [];
  const seenLabels = new Set<string>();
  for (const d of detections) {
    const rule = RULES[d.label];
    if (!rule) continue;
    const severity = rule.severity[ageGroup];
    if (!severity) continue; // nije rizik za ovaj uzrast
    // Jedan tip objekta prijavi najviše 2 puta da overlay ne bude pretrpan
    const count = [...seenLabels].filter((l) => l === d.label).length;
    if (count >= 2) continue;
    seenLabels.add(d.label);
    hazards.push({
      id: `local-${hazards.length}-${d.label.replace(/\s/g, "_")}`,
      label: rule.labelSr,
      category: rule.category,
      severity,
      box: d.box,
      why: rule.why,
      stats: rule.stats,
      fix: rule.fix,
      resolved: false,
    });
  }
  // Kritične prve
  const order: Severity[] = ["critical", "high", "medium", "low"];
  return hazards.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}
