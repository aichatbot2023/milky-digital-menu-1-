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
    en: "Detailed analysis of a single photo of the room",
    sr: "Detaljna analiza jedne slike prostora",
  },
  "btn.food": { en: "🍼 Scan food & drink", sr: "🍼 Skeniraj hranu i piće" },
  "btn.food.sub": {
    en: "Can my child eat this? Ingredients, allergens, choking risks — by age",
    sr: "Da li dete sme ovo da jede? Sastojci, alergeni, rizik gušenja — po uzrastu",
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
  "live.cloudnote": { en: "On-device detection active · cloud analysis:", sr: "Lokalna detekcija aktivna · cloud analiza:" },
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
