/**
 * Višejezičnost. Korisnik bira jezik pri prvom pokretanju; od tada:
 *  - AI sadržaj (analize prostora/hrane, asistent) stiže NA TOM JEZIKU
 *    (edge funkcije dobijaju "language" i LLM odgovara na njemu)
 *  - glas (ASR/TTS) radi na tom jeziku
 *  - UI tekstovi: potpuni prevodi en + sr; ostali jezici koriste engleski
 *    UI dok se prevodi ne dodaju (AI sadržaj je uvek na izabranom jeziku)
 */
import type { AgeGroup, HazardCategory, RoomType, Severity } from "../types";

export interface LangDef {
  code: string;
  /** Ime jezika na engleskom — šalje se LLM-u ("Respond in Serbian"). */
  english: string;
  /** Ime na samom jeziku — prikaz u biraču. */
  native: string;
  /** BCP-47 za Web Speech API (ASR/TTS). */
  speech: string;
  rtl?: boolean;
}

export const LANGS: LangDef[] = [
  { code: "en", english: "English", native: "English", speech: "en-US" },
  { code: "sr", english: "Serbian", native: "Srpski", speech: "sr-RS" },
  { code: "es", english: "Spanish", native: "Español", speech: "es-ES" },
  { code: "pt", english: "Portuguese", native: "Português", speech: "pt-PT" },
  { code: "fr", english: "French", native: "Français", speech: "fr-FR" },
  { code: "de", english: "German", native: "Deutsch", speech: "de-DE" },
  { code: "it", english: "Italian", native: "Italiano", speech: "it-IT" },
  { code: "nl", english: "Dutch", native: "Nederlands", speech: "nl-NL" },
  { code: "pl", english: "Polish", native: "Polski", speech: "pl-PL" },
  { code: "ru", english: "Russian", native: "Русский", speech: "ru-RU" },
  { code: "uk", english: "Ukrainian", native: "Українська", speech: "uk-UA" },
  { code: "tr", english: "Turkish", native: "Türkçe", speech: "tr-TR" },
  { code: "ar", english: "Arabic", native: "العربية", speech: "ar-SA", rtl: true },
  { code: "he", english: "Hebrew", native: "עברית", speech: "he-IL", rtl: true },
  { code: "fa", english: "Persian", native: "فارسی", speech: "fa-IR", rtl: true },
  { code: "ur", english: "Urdu", native: "اردو", speech: "ur-PK", rtl: true },
  { code: "hi", english: "Hindi", native: "हिन्दी", speech: "hi-IN" },
  { code: "bn", english: "Bengali", native: "বাংলা", speech: "bn-BD" },
  { code: "zh", english: "Chinese", native: "中文", speech: "zh-CN" },
  { code: "ja", english: "Japanese", native: "日本語", speech: "ja-JP" },
  { code: "ko", english: "Korean", native: "한국어", speech: "ko-KR" },
  { code: "id", english: "Indonesian", native: "Bahasa Indonesia", speech: "id-ID" },
  { code: "ms", english: "Malay", native: "Bahasa Melayu", speech: "ms-MY" },
  { code: "vi", english: "Vietnamese", native: "Tiếng Việt", speech: "vi-VN" },
  { code: "th", english: "Thai", native: "ไทย", speech: "th-TH" },
  { code: "fil", english: "Filipino", native: "Filipino", speech: "fil-PH" },
  { code: "sw", english: "Swahili", native: "Kiswahili", speech: "sw-KE" },
  { code: "sv", english: "Swedish", native: "Svenska", speech: "sv-SE" },
  { code: "no", english: "Norwegian", native: "Norsk", speech: "nb-NO" },
  { code: "da", english: "Danish", native: "Dansk", speech: "da-DK" },
  { code: "fi", english: "Finnish", native: "Suomi", speech: "fi-FI" },
  { code: "el", english: "Greek", native: "Ελληνικά", speech: "el-GR" },
  { code: "cs", english: "Czech", native: "Čeština", speech: "cs-CZ" },
  { code: "sk", english: "Slovak", native: "Slovenčina", speech: "sk-SK" },
  { code: "hu", english: "Hungarian", native: "Magyar", speech: "hu-HU" },
  { code: "ro", english: "Romanian", native: "Română", speech: "ro-RO" },
  { code: "bg", english: "Bulgarian", native: "Български", speech: "bg-BG" },
  { code: "hr", english: "Croatian", native: "Hrvatski", speech: "hr-HR" },
  { code: "bs", english: "Bosnian", native: "Bosanski", speech: "bs-BA" },
  { code: "sl", english: "Slovenian", native: "Slovenščina", speech: "sl-SI" },
  { code: "mk", english: "Macedonian", native: "Македонски", speech: "mk-MK" },
  { code: "sq", english: "Albanian", native: "Shqip", speech: "sq-AL" },
];

const LANG_KEY = "safenest.lang";

export function getLang(): string {
  try {
    return localStorage.getItem(LANG_KEY) ?? "";
  } catch {
    return "en";
  }
}

export function langChosen(): boolean {
  return getLang() !== "";
}

export function setLang(code: string) {
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    /* ignoriši */
  }
  applyDir(code);
}

export function applyDir(code = getLang()) {
  const def = LANGS.find((l) => l.code === code);
  document.documentElement.dir = def?.rtl ? "rtl" : "ltr";
  if (code) document.documentElement.lang = code;
}

/** Ime jezika na engleskom za LLM prompt ("Respond in German"). */
export function languageEnglishName(): string {
  return LANGS.find((l) => l.code === getLang())?.english ?? "English";
}

/** BCP-47 lokal za Web Speech API. */
export function speechLocale(): string {
  return LANGS.find((l) => l.code === getLang())?.speech ?? "en-US";
}

/** Da li lokalna baza znanja koristi srpske tekstove (inače engleski). */
export function isSr(): boolean {
  const c = getLang();
  return c === "sr" || c === "bs" || c === "hr" || c === "";
}

type Dict = Record<string, { en: string; sr: string }>;

const D: Dict = {
  // Početni ekran
  "hero.sub": {
    en: "Scan any room with your camera — AI marks the dangers for your child and shows you how to remove them.",
    sr: "Skenirajte prostor kamerom — AI označava opasnosti po vaše dete i pokazuje kako da ih uklonite.",
  },
  "profiles.title": { en: "Child profile", sr: "Profil deteta" },
  "profiles.hint": {
    en: "AI adapts the analysis to the selected child's age.",
    sr: "AI prilagođava analizu uzrastu izabranog deteta.",
  },
  "profiles.add": { en: "+ Add child", sr: "+ Dodaj dete" },
  "profiles.name": { en: "Child's name", sr: "Ime deteta" },
  "profiles.save": { en: "Save", sr: "Sačuvaj" },
  "profiles.cancel": { en: "Cancel", sr: "Otkaži" },
  "room.title": { en: "Room type", sr: "Tip prostora" },
  "btn.live": { en: "🎥 Live scanning", sr: "🎥 Uživo skeniranje" },
  "btn.live.sub": {
    en: "AI marks and explains dangers in real time",
    sr: "AI označava i objašnjava opasnosti u realnom vremenu",
  },
  "btn.photo": { en: "📷 Scan a photo", sr: "📷 Skeniraj fotografiju" },
  "btn.photo.sub": {
    en: "Take a photo or choose one from your gallery — detailed analysis",
    sr: "Slikajte ili izaberite sliku iz galerije — detaljna analiza",
  },
  "btn.food": { en: "🍼 Scan food & drink", sr: "🍼 Skeniraj hranu i piće" },
  "btn.food.sub": {
    en: "Snap or upload a photo of food/label — allergens & choking risks by age",
    sr: "Slikajte ili izaberite sliku hrane/etikete — alergeni i rizik gušenja po uzrastu",
  },
  "history.title": { en: "Previous scans", sr: "Prethodna skeniranja" },
  "history.score": { en: "score", sr: "skor" },
  "history.unresolved": { en: "unresolved", sr: "nerešeno" },
  "history.resolved": { en: "All resolved ✓", sr: "Sve rešeno ✓" },
  "history.delete": { en: "Delete scan", sr: "Obriši sken" },
  "footer.disclaimer": {
    en: "SafeNest AI is an educational aid and does not replace adult supervision or professional medical advice.",
    sr: "SafeNest AI je edukativni pomoćni alat i ne zamenjuje nadzor odrasle osobe niti profesionalni medicinski savet.",
  },
  "footer.version": { en: "version", sr: "verzija" },
  "footer.company": {
    en: "A product of Nicholas Family LTD, London, United Kingdom",
    sr: "Proizvod kompanije Nicholas Family LTD, London, Ujedinjeno Kraljevstvo",
  },
  // Pretplata
  "sub.trial": { en: "🎁 Free period:", sr: "🎁 Besplatni period:" },
  "sub.daysLeft": { en: "days left", sr: "dana" },
  "sub.dayLeft": { en: "day left", sr: "dan" },
  "sub.trialTail": { en: "· Then €7/mo", sr: "· Pretplata 7 €/mes." },
  "sub.expired": {
    en: "⚠️ Your free period has ended — subscribe for €7/month.",
    sr: "⚠️ Besplatni period je istekao — pretplatite se za 7 €/mes.",
  },
  "sub.active": { en: "⭐ Premium active — thank you!", sr: "⭐ Premium aktivan — hvala vam!" },
  "paywall.title": { en: "⭐ SafeNest AI Premium", sr: "⭐ SafeNest AI Premium" },
  "paywall.expired": {
    en: "Your 7 free days have ended. Keep protecting your home with Premium.",
    sr: "Vaših 7 besplatnih dana je isteklo. Nastavite da štitite svoj dom uz Premium.",
  },
  "paywall.trial": {
    en: "Your first 7 days are completely free — no card required. After that:",
    sr: "Prvih 7 dana je potpuno besplatno — bez kartice. Posle toga:",
  },
  "paywall.price": { en: "€7 / month", sr: "7 € mesečno" },
  "paywall.cancel": { en: "cancel anytime", sr: "otkažite bilo kada" },
  "paywall.b1": {
    en: "🎥 Unlimited live scanning with AI explanations",
    sr: "🎥 Neograničeno uživo skeniranje sa AI objašnjenjima",
  },
  "paywall.b2": {
    en: "🔬 Precise multi-layer photo analysis (even small objects)",
    sr: "🔬 Precizna višeslojna analiza fotografija (i sitni predmeti)",
  },
  "paywall.b3": { en: "🎤 Voice AI safety assistant, 24/7", sr: "🎤 Glasovni AI asistent za bezbednost, 24/7" },
  "paywall.b4": {
    en: "🧠 The app learns from your feedback and gets more precise",
    sr: "🧠 Aplikacija uči iz vaših ocena i postaje preciznija",
  },
  "paywall.b5": { en: "👶 Profiles for multiple children, adapted by age", sr: "👶 Profili za više dece, prilagođeno uzrastu" },
  "paywall.subscribe": { en: "Subscribe —", sr: "Pretplati se —" },
  "paywall.autoNote": {
    en: "After payment you'll be returned to the app automatically and Premium activates itself — no codes needed.",
    sr: "Posle uplate bićete automatski vraćeni u aplikaciju i Premium se uključuje sam — bez ikakvih kodova.",
  },
  "paywall.codePrompt": { en: "Backup option — have an activation code?", sr: "Rezervna opcija — imate aktivacioni kod?" },
  "paywall.activate": { en: "Activate", sr: "Aktiviraj" },
  "paywall.codeError": { en: "Code not recognized. Please check.", sr: "Kod nije prepoznat. Proverite unos." },
  "paywall.notNow": { en: "Not now", sr: "Ne sada" },
  "paywall.closeBtn": { en: "Close", sr: "Zatvori" },
  "pay.checking": { en: "Verifying your payment…", sr: "Proveravam uplatu…" },
  "pay.thanks": { en: "🎉 Thank you for subscribing! Premium is now active.", sr: "🎉 Hvala na pretplati! Premium je aktiviran." },
  "pay.failed": {
    en: "Payment not confirmed yet. If you paid, wait a minute and refresh — or email office@aichatbot.rs.",
    sr: "Uplata još nije potvrđena. Ako ste platili, sačekajte minut pa osvežite stranicu — ili nam pišite na office@aichatbot.rs.",
  },
  // Skeniranje
  "scanning.title": { en: "AI is analysing the room…", sr: "AI analizira prostor…" },
  "scanning.sub1": {
    en: "Multi-layer precise analysis (on-device AI + cloud) — looking for even small objects dangerous to",
    sr: "Višeslojna precizna analiza (lokalni AI + cloud) — tražimo i sitne predmete opasne za",
  },
  "scanning.sub2": { en: "This takes 10–30 seconds.", sr: "Ovo traje 10–30 sekundi." },
  "scanning.child": { en: "your child", sr: "dete" },
  "back": { en: "← Back", sr: "← Nazad" },
  "home": { en: "Home", sr: "Početna" },
  "safety": { en: "Safety", sr: "Bezbednost" },
  "stats.total": { en: "Total", sr: "Ukupno" },
  "stats.resolved": { en: "Resolved", sr: "Rešeno" },
  "result.none": { en: "No hazards spotted in this photo. 🎉", sr: "Nismo uočili opasnosti na ovoj fotografiji. 🎉" },
  // Detalji opasnosti
  "sheet.why": { en: "⚠️ Why it's dangerous", sr: "⚠️ Zašto je opasno" },
  "sheet.stats": { en: "📊 Injury statistics", sr: "📊 Statistika povreda" },
  "sheet.fix": { en: "✅ How to fix it", sr: "✅ Kako rešiti" },
  "sheet.fb.title": { en: "🧠 Did the AI get it right?", sr: "🧠 Da li je AI pogodio?" },
  "sheet.fb.thanks": {
    en: "Thank you! The app learns from your rating and will be more precise next time.",
    sr: "Hvala! Aplikacija uči iz vaše ocene i sledeći put će biti preciznija.",
  },
  "sheet.fb.yes": { en: "👍 Correct, a hazard", sr: "👍 Tačno, opasnost" },
  "sheet.fb.no": { en: "👎 Not a hazard", sr: "👎 Nije opasnost" },
  "sheet.resolve": { en: "Mark as resolved", sr: "Označi kao rešeno" },
  "sheet.unresolve": { en: "Mark as unresolved", sr: "Vrati kao nerešeno" },
  "sheet.srcLocal": { en: "On-device AI", sr: "Lokalni AI u telefonu" },
  "sheet.srcConf": { en: "confidence", sr: "pouzdanost" },
  "sheet.srcCloud": { en: "Cloud vision AI (Nemotron) · detailed image analysis", sr: "Cloud vision AI (Nemotron) · detaljna analiza slike" },
  // Live
  "live.loading": { en: "Loading AI model… (a few seconds, one-time)", sr: "Učitavam AI model… (par sekundi, jednokratno)" },
  "live.scanning": { en: "Scanning — move the camera slowly around the room", sr: "Skeniram — polako pomerajte kameru kroz prostor" },
  "live.one": { en: "hazard in frame", sr: "opasnost u kadru" },
  "live.many": { en: "hazards in frame", sr: "opasnosti u kadru" },
  "live.retry": { en: "↻ Try again", sr: "↻ Pokušaj ponovo" },
  "live.finish": { en: "✓ Finish scan", sr: "✓ Završi sken" },
  "live.resume": { en: "▶ Resume scanning", sr: "▶ Nastavi skeniranje" },
  "live.tapMore": { en: "Tap for the fix and statistics →", sr: "Dodirnite za rešenje i statistiku →" },
  "live.cloudnote": {
    en: "🛡️ On-device AI active · deep AI explanations are on their way…",
    sr: "🛡️ Lokalni AI aktivan · dubinska AI objašnjenja samo što nisu stigla…",
  },
  "live.soundOn": { en: "Voice alerts on.", sr: "Glasovna upozorenja uključena." },
  "live.alert": { en: "Attention:", sr: "Pažnja:" },
  "live.risk": { en: "risk", sr: "rizik" },
  "live.camError": {
    en: "Camera unavailable or permission denied. Allow camera access in settings or use photo mode.",
    sr: "Kamera nije dostupna ili je pristup odbijen. Dozvolite kameru u podešavanjima ili koristite foto mod.",
  },
  "live.sessionDone1": { en: "Live scan finished:", sr: "Uživo skeniranje završeno:" },
  "live.sessionDone2": {
    en: "potential hazards were spotted during the session. Go through the list, fix them one by one and mark them resolved.",
    sr: "potencijalnih opasnosti tokom sesije. Prođite kroz listu, rešite ih jednu po jednu i označite kao rešene.",
  },
  "live.sessionNone": {
    en: "Live scan finished with no hazards spotted. Also check zones the camera can't see (outlets, cords, chemicals in cabinets).",
    sr: "Uživo skeniranje završeno bez uočenih opasnosti. Proverite i zone koje kamera ne vidi (utičnice, gajtani, hemikalije u ormarićima).",
  },
  // Glasovni asistent
  "va.fab": { en: "🎤 Ask the assistant", sr: "🎤 Pitaj asistenta" },
  "va.title": { en: "🎤 Voice assistant", sr: "🎤 Glasovni asistent" },
  "va.hint": {
    en: 'Ask anything about child safety — e.g. "Why is the stove dangerous?" or "How do I secure the balcony?"',
    sr: "Pitajte bilo šta o bezbednosti — npr. „Zašto je šporet opasan?“ ili „Kako da obezbedim terasu?“",
  },
  "va.speak": { en: "🎤 Speak", sr: "🎤 Govori" },
  "va.stop": { en: "⏹ Stop (listening…)", sr: "⏹ Zaustavi (slušam…)" },
  "va.type": { en: "…or type your question", sr: "…ili upišite pitanje" },
  "va.send": { en: "Send", sr: "Pošalji" },
  "va.thinking": { en: "Thinking…", sr: "Razmišljam…" },
  "va.transcribing": { en: "Transcribing your voice…", sr: "Prepoznajem govor…" },
  "va.noMic": {
    en: "I couldn't hear you — check the microphone permission or type your question below.",
    sr: "Nisam čuo pitanje — proverite dozvolu za mikrofon ili upišite pitanje ispod.",
  },
  "va.unsupported": {
    en: "Voice input isn't supported in this browser — type your question and I'll speak the answer aloud. 🔊",
    sr: "Glasovni unos nije podržan u ovom pregledaču — upišite pitanje, a odgovor ću izgovoriti naglas. 🔊",
  },
  "va.repeat": { en: "🔊 Repeat", sr: "🔊 Ponovi" },
  // Hrana
  "food.checking": { en: "AI is checking the food…", sr: "AI proverava hranu…" },
  "food.checkingSub": { en: "Ingredients, allergens and choking risks for age", sr: "Sastojci, alergeni i rizik gušenja za uzrast" },
  "food.forAge": { en: "Assessment for age:", sr: "Procena za uzrast:" },
  "food.choking": { en: "⚠️ Choking risk", sr: "⚠️ Rizik gušenja" },
  "food.allergens": { en: "🥜 Allergens", sr: "🥜 Alergeni" },
  "food.items": { en: "Ingredients / foods", sr: "Sastojci / namirnice" },
  "food.prep": { en: "✅ How to serve it safely", sr: "✅ Kako bezbedno servirati" },
  "food.again": { en: "📷 Scan another food", sr: "📷 Skeniraj drugu hranu" },
  "food.offline": {
    en: "AI image analysis is currently unavailable — here are the key feeding rules for this age:",
    sr: "AI analiza slike trenutno nije dostupna — evo ključnih pravila ishrane za ovaj uzrast:",
  },
  "food.guidelines": { en: "🍽️ Guidelines for age:", sr: "🍽️ Smernice za uzrast:" },
  "food.disclaimer": {
    en: "This assessment is educational — for allergies and medical conditions, always consult your paediatrician.",
    sr: "Procena je informativna — za alergije i posebna stanja odlučuje pedijatar.",
  },
  "food.safe": { en: "Safe with supervision", sr: "Bezbedno uz nadzor" },
  "food.caution": { en: "With caution", sr: "Uz oprez" },
  "food.unsafe": { en: "Do not give", sr: "Ne davati" },
  // Jezik
  "lang.title": { en: "Choose your language", sr: "Izaberite jezik" },
  "lang.sub": {
    en: "Everything in the app — detections, warnings and education — will be in your language.",
    sr: "Sve u aplikaciji — detekcije, upozorenja i edukacija — biće na vašem jeziku.",
  },
  "lang.search": { en: "Search languages…", sr: "Pretraži jezike…" },
  "lang.continue": { en: "Continue", sr: "Nastavi" },
  // Verdikt "Moguće"
  "maybe": { en: "Possibly:", sr: "Moguće:" },
  // Foto sken rezime
  "scan.extras": {
    en: "The on-device AI additionally spotted", sr: "Lokalni AI je precizno uočio još",
  },
  "scan.extrasTail": { en: "more object(s).", sr: "objekat/objekata." },
  "scan.localSummary": {
    en: "Precise on-device AI analysis (multi-layer image scan): risky objects were recognised for the selected age. Tap a marker for the explanation and fix.",
    sr: "Precizna lokalna AI analiza (višeslojno skeniranje slike): prepoznati su rizični objekti za izabrani uzrast. Dodirnite marker za objašnjenje i rešenje.",
  },
  "scan.localNone": {
    en: "Precise on-device AI analysis found no risky objects. Also check zones the model can't see (outlets, edges, cables).",
    sr: "Precizna lokalna AI analiza nije uočila rizične objekte. Proverite i zone koje model ne vidi (utičnice, ivice, kablovi).",
  },
  "scan.failed": { en: "Analysis failed. Please try again.", sr: "Analiza nije uspela. Pokušajte ponovo." },
  // Onboarding
  "onb.1t": { en: "Scan any room", sr: "Skenirajte bilo koji prostor" },
  "onb.1d": {
    en: "Point the camera and pan slowly — AI marks dangerous objects live on screen. Or analyse a photo from your gallery.",
    sr: "Uperite kameru i polako pomerajte — AI uživo označava opasne predmete na ekranu. Ili analizirajte sliku iz galerije.",
  },
  "onb.2t": { en: "Understand the colours", sr: "Razumejte boje" },
  "onb.2d": {
    en: "Red = critical, orange = high, yellow = medium, blue = low. Tap any marker for why it's dangerous, real statistics and the fix.",
    sr: "Crveno = kritično, narandžasto = visoko, žuto = srednje, plavo = nisko. Dodirnite marker za objašnjenje, statistiku i rešenje.",
  },
  "onb.3t": { en: "Add your child", sr: "Dodajte svoje dete" },
  "onb.3d": {
    en: "The AI adapts every analysis to your child's age — what's safe for a 5-year-old can be critical for a baby. Food checks too!",
    sr: "AI prilagođava svaku analizu uzrastu deteta — što je bezbedno za petogodišnjaka, za bebu može biti kritično. Važi i za hranu!",
  },
  "onb.next": { en: "Next", sr: "Dalje" },
  "onb.skip": { en: "Skip", sr: "Preskoči" },
  "onb.start": { en: "Start protecting 🛡️", sr: "Počni zaštitu 🛡️" },

  // Ekran analize — koraci umesto praznog čekanja
  "analyzing.title": { en: "Analysing your space", sr: "Analiziram vaš prostor" },
  "analyzing.food": { en: "Analysing the food", sr: "Analiziram hranu" },
  "analyzing.s1": { en: "Detecting objects", sr: "Prepoznajem predmete" },
  "analyzing.s2": { en: "Estimating reach and height", sr: "Procenjujem dohvat i visinu" },
  "analyzing.s3": { en: "Checking child safety", sr: "Proveravam bezbednost za dete" },
  "analyzing.s4": { en: "Prioritising by risk", sr: "Rangiram po riziku" },
  "analyzing.s5": { en: "Finding safer alternatives", sr: "Tražim sigurnije alternative" },
  "analyzing.f1": { en: "Identifying the food", sr: "Prepoznajem namirnicu" },
  "analyzing.f2": { en: "Checking ingredients and allergens", sr: "Proveravam sastojke i alergene" },
  "analyzing.f3": { en: "Assessing choking risk", sr: "Procenjujem rizik od gušenja" },
  "analyzing.f4": { en: "Preparing serving advice", sr: "Pripremam savet za serviranje" },
  "analyzing.note": {
    en: "This takes a few seconds. Keep the app open.",
    sr: "Traje nekoliko sekundi. Ostavite aplikaciju otvorenu.",
  },

  // Fokus ekran — jedna opasnost, jedna akcija
  "focus.priority": { en: "Priority", sr: "Prioritet" },
  "focus.of": { en: "of", sr: "od" },
  "focus.do": { en: "Do this now", sr: "Uradite odmah" },
  "focus.why": { en: "Why this is dangerous", sr: "Zašto je ovo opasno" },
  "focus.safer": { en: "Safer alternatives", sr: "Sigurnije alternative" },
  "focus.saferBtn": { en: "See safer alternatives", sr: "Pogledaj sigurnije alternative" },
  "focus.view": { en: "View", sr: "Pogledaj" },
  "focus.fixed": { en: "Mark as fixed", sr: "Rešeno" },
  "focus.remaining": { en: "Remaining:", sr: "Preostalo:" },
  "focus.fixedCount": { en: "fixed", sr: "rešeno" },
  "focus.allClear": { en: "All clear", sr: "Sve je rešeno" },
  "focus.next": { en: "Next", sr: "Sledeće" },
  "focus.doneTitle": { en: "This space is safe", sr: "Ovaj prostor je bezbedan" },
  "focus.doneSub": {
    en: "You fixed everything we found. Scan again after you rearrange the room.",
    sr: "Rešili ste sve što smo pronašli. Skenirajte ponovo kada preuredite prostor.",
  },
  "focus.newScan": { en: "New scan", sr: "Novo skeniranje" },
  // Donja navigacija i ekran kamere
  "nav.scan": { en: "Scan", sr: "Skeniraj" },
  "nav.history": { en: "History", sr: "Istorija" },
  "nav.tips": { en: "Tips", sr: "Saveti" },
  "nav.profile": { en: "Profile", sr: "Profil" },
  "cam.hint": { en: "Point the camera at the room", sr: "Usmerite kameru ka prostoru" },
  "cam.hintFood": { en: "Point at the food or the label", sr: "Usmerite ka hrani ili etiketi" },
  "cam.shoot": { en: "Take photo", sr: "Slikaj" },
  "cam.gallery": { en: "Choose from gallery", sr: "Izaberi iz galerije" },
  "cam.noAccess": {
    en: "Camera unavailable — choose a photo from your gallery",
    sr: "Kamera nije dostupna — izaberite sliku iz galerije",
  },
  "scan.mainTitle": { en: "Scan a room", sr: "Skenirajte prostor" },
  "scan.mainSub": {
    en: "AI finds the dangers for your child and tells you what to do first.",
    sr: "AI pronalazi opasnosti za vaše dete i kaže šta prvo da uradite.",
  },
  "scan.for": { en: "Scanning for", sr: "Skeniram za" },
  "hist.emptyTitle": { en: "No scans yet", sr: "Još nema skeniranja" },
  "hist.emptySub": {
    en: "Your scans and unresolved hazards will appear here so you can track progress.",
    sr: "Ovde će se pojaviti vaša skeniranja i nerešene opasnosti, da pratite napredak.",
  },
  "tips.title": { en: "Safety tips", sr: "Bezbednosni saveti" },
  "profile.title": { en: "Profile", sr: "Profil" },
  "profile.lang": { en: "Language", sr: "Jezik" },
  "profile.memory": { en: "Hazard memory", sr: "Memorija opasnosti" },
  "profile.memoryClear": { en: "Clear memory", sr: "Obriši memoriju" },
  "profile.memoryNote": {
    en: "The app remembers unresolved hazards to recognise them in your next scan. Clear it after moving house.",
    sr: "Aplikacija pamti nerešene opasnosti da ih prepozna pri sledećem skeniranju. Obrišite je posle selidbe.",
  },

  // Memorija opasnosti (re-identifikacija kroz skenove)
  "mem.seen": { en: "Seen", sr: "Viđeno" },
  "mem.times": { en: "times", sr: "puta" },
  "mem.unresolvedDays": { en: "Unresolved for", sr: "Nerešeno već" },
  "mem.days": { en: "days", sr: "dana" },
  "mem.since": { en: "since yesterday", sr: "od juče" },
  "mem.uncertain": { en: "possibly the same object", sr: "verovatno isti predmet" },
  "mem.carriedTitle": { en: "Unresolved from earlier", sr: "Nerešeno od ranije" },
  "mem.carriedSub": {
    en: "The app remembers these and will recognise them in your next scan.",
    sr: "Aplikacija ih pamti i prepoznaće ih pri sledećem skeniranju.",
  },
  "mem.askTitle": { en: "Did you fix this?", sr: "Da li ste ovo rešili?" },
  "mem.askSub": {
    en: "These were not visible in the new scan. Confirm so we can update your safety score.",
    sr: "Ovo se nije videlo u novom skeniranju. Potvrdite da ažuriramo vaš bezbednosni skor.",
  },
  "mem.yesFixed": { en: "Yes, fixed", sr: "Da, rešeno" },
  "mem.stillThere": { en: "Still there", sr: "I dalje stoji" },
  "mem.recognized": { en: "recognised from earlier scans", sr: "prepoznato iz ranijih skenova" },
  "focus.searchFor": { en: "Find on Amazon:", sr: "Pronađi na Amazonu:" },
  "focus.wrong": { en: "This isn't right", sr: "Ovo nije tačno" },

  // Brend marketplace (preporuke partnerskih proizvoda)
  "shop.title": { en: "Recommended solutions", sr: "Preporučena rešenja" },
  "shop.note": {
    en: "Products from our partner brands that solve this hazard. As an Amazon Associate, SafeNest AI earns from qualifying purchases.",
    sr: "Proizvodi partnerskih brendova koji rešavaju ovu opasnost. Kao Amazon Associate, SafeNest AI zarađuje od kvalifikovanih kupovina.",
  },
  "shop.view": { en: "View", sr: "Pogledaj" },
  "shop.hide": { en: "Hide recommendations", sr: "Sakrij preporuke" },
  "shop.show": { en: "Show partner recommendations", sr: "Prikaži preporuke partnera" },

  // Registracija (obavezna pre skeniranja)
  "reg.title": { en: "Create your free account", sr: "Napravite besplatan nalog" },
  "reg.sub": {
    en: "7 days completely free — no card needed. Your scans and child profiles stay saved.",
    sr: "7 dana potpuno besplatno — bez kartice. Vaši skenovi i profili deteta ostaju sačuvani.",
  },
  "reg.name": { en: "Your name", sr: "Vaše ime" },
  "reg.email": { en: "Email address", sr: "Email adresa" },
  "reg.cta": { en: "Start 7 days free", sr: "Započni 7 dana besplatno" },
  "reg.invalid": { en: "Please enter a valid email address.", sr: "Unesite ispravnu email adresu." },
  "reg.gdpr": {
    en: "We only use your email for your account and important safety updates. No spam. GDPR compliant.",
    sr: "Email koristimo samo za vaš nalog i važna bezbednosna obaveštenja. Bez spama. U skladu sa GDPR.",
  },
  // Check-lista
  "check.btn": { en: "🧾 Safety checklist", sr: "🧾 Bezbednosna check-lista" },
  "check.btn.sub": {
    en: "What the camera can't see — boiler, outlets, cords, chemicals",
    sr: "Ono što kamera ne vidi — bojler, utičnice, gajtani, hemikalije",
  },
  "check.title": { en: "🧾 Safety checklist", sr: "🧾 Bezbednosna check-lista" },
  "check.sub": {
    en: "Expert checks the camera can't make. Tick them off — progress is saved on your device.",
    sr: "Ekspertske provere koje kamera ne može da uradi. Čekirajte ih — napredak se čuva na uređaju.",
  },
  "check.done": { en: "done", sr: "završeno" },
  // Prva pomoć
  "fa.btn": { en: "🚑 First aid", sr: "🚑 Prva pomoć" },
  "fa.btn.sub": {
    en: "Choking, burns, poisoning — step-by-step, works offline",
    sr: "Gušenje, opekotine, trovanje — korak po korak, radi i bez interneta",
  },
  "fa.title": { en: "🚑 First aid for children", sr: "🚑 Prva pomoć za decu" },
  "fa.warning": {
    en: "In a serious emergency FIRST call your emergency number (112 / 999 / 911 — in Serbia 194). These steps are educational and do not replace professional help or a first-aid course.",
    sr: "U ozbiljnoj situaciji PRVO pozovite hitnu pomoć (194, iz EU 112). Ovi koraci su edukativni i ne zamenjuju profesionalnu pomoć ni kurs prve pomoći.",
  },
  // Deljenje i podsetnik
  "share.btn": { en: "📤 Share report", sr: "📤 Podeli izveštaj" },
  "share.copied": { en: "Report copied — paste it anywhere.", sr: "Izveštaj kopiran — nalepite ga bilo gde." },
  "share.title": { en: "SafeNest AI safety report", sr: "SafeNest AI izveštaj o bezbednosti" },
  "nudge.pre": { en: "🔄 It's been", sr: "🔄 Prošlo je" },
  "nudge.days": { en: "days since your last scan — rooms change, kids grow. Time for a fresh scan!", sr: "dana od poslednjeg skena — prostor se menja, deca rastu. Vreme je za novi sken!" },
};

export function t(key: string): string {
  const e = D[key];
  if (!e) return key;
  return isSr() ? e.sr : e.en;
}

// Lokalizovane oznake domena
const AGE: Record<AgeGroup, { en: string; sr: string }> = {
  "0-6m": { en: "0–6 months", sr: "0–6 meseci" },
  "6-12m": { en: "6–12 months (crawling)", sr: "6–12 meseci (puzanje)" },
  "1-2y": { en: "1–2 years (walking)", sr: "1–2 godine (prohodavanje)" },
  "2-4y": { en: "2–4 years (climbing)", sr: "2–4 godine (penjanje)" },
  "4-7y": { en: "4–7 years", sr: "4–7 godina" },
  "7y+": { en: "7+ years", sr: "7+ godina" },
};

const ROOM: Record<RoomType, { en: string; sr: string }> = {
  living_room: { en: "Living room", sr: "Dnevna soba" },
  kitchen: { en: "Kitchen", sr: "Kuhinja" },
  bathroom: { en: "Bathroom", sr: "Kupatilo" },
  bedroom: { en: "Bedroom", sr: "Spavaća soba" },
  restaurant_table: { en: "Restaurant table", sr: "Restoranski sto" },
  outdoor: { en: "Yard / terrace", sr: "Dvorište / terasa" },
};

const SEV: Record<Severity, { en: string; sr: string }> = {
  critical: { en: "Critical", sr: "Kritično" },
  high: { en: "High", sr: "Visoko" },
  medium: { en: "Medium", sr: "Srednje" },
  low: { en: "Low", sr: "Nisko" },
};

const CAT: Record<HazardCategory, { en: string; sr: string }> = {
  fall: { en: "Fall", sr: "Pad" },
  choking: { en: "Choking", sr: "Gušenje" },
  poisoning: { en: "Poisoning", sr: "Trovanje" },
  burn: { en: "Burn", sr: "Opekotina" },
  electric: { en: "Electricity", sr: "Struja" },
  cutting: { en: "Cut", sr: "Posekotina" },
  drowning: { en: "Drowning", sr: "Davljenje" },
  crush: { en: "Crush", sr: "Prignječenje" },
  strangulation: { en: "Strangulation", sr: "Davljenje trakom/kablom" },
  other: { en: "Other", sr: "Ostalo" },
};

export const ageLabel = (a: AgeGroup) => (isSr() ? AGE[a].sr : AGE[a].en);
export const roomLabel = (r: RoomType) => (isSr() ? ROOM[r].sr : ROOM[r].en);
export const severityLabel = (s: Severity) => (isSr() ? SEV[s].sr : SEV[s].en);
export const categoryLabel = (c: HazardCategory) => (isSr() ? CAT[c].sr : CAT[c].en);

/** Ikona kategorije — čini markere prepoznatljivim na prvi pogled. */
export const CATEGORY_ICONS: Record<HazardCategory, string> = {
  fall: "🪜",
  choking: "🫁",
  poisoning: "☠️",
  burn: "🔥",
  electric: "⚡",
  cutting: "🔪",
  drowning: "💧",
  crush: "🪨",
  strangulation: "🪢",
  other: "⚠️",
};
