/**
 * Dvojezičan interfejs (engleski + srpski). Jezik se bira iz ?lang= ili
 * iz jezika pregledača; AI opis prostora se traži na istom jeziku, pa
 * kupac nikad ne vidi mešavinu.
 */
type Dict = Record<string, { en: string; sr: string }>;

const D: Dict = {
  // ——— odeljenje / landing
  "d.kicker": { en: "A department of SafeNest AI", sr: "Odeljenje SafeNest AI platforme" },
  "d.h1": { en: "Your customers photograph the room. You sell the right piece.", sr: "Kupac slika prostoriju. Vi prodate pravi komad." },
  "d.sub": {
    en: "SpaceMatch AI is a white-label visual recommendation engine. Your brand, your catalogue, your customers — a scanner that reads a space and suggests what actually belongs in it.",
    sr: "SpaceMatch AI je motor vizuelnih preporuka pod vašim brendom. Vaš katalog, vaši kupci — skener koji čita prostor i predlaže ono što zaista pripada u njega.",
  },
  "d.try": { en: "Try the live demo", sr: "Probaj demo uživo" },
  "d.talk": { en: "Request access", sr: "Zatraži pristup" },
  "d.for": { en: "Built for", sr: "Napravljeno za" },
  "d.how": { en: "How it works", sr: "Kako radi" },
  "d.s1t": { en: "Photograph", sr: "Fotografiši" },
  "d.s1d": { en: "The customer takes one photo of the room. Nothing to install, nothing to measure.", sr: "Kupac napravi jednu fotografiju prostorije. Ništa se ne instalira, ništa se ne meri." },
  "d.s2t": { en: "Understand", sr: "Razumevanje" },
  "d.s2d": { en: "Style, light, palette, materials and the size of the empty wall — read in seconds.", sr: "Stil, svetlo, paleta, materijali i veličina praznog zida — pročitani za nekoliko sekundi." },
  "d.s3t": { en: "Recommend", sr: "Preporuka" },
  "d.s3d": { en: "Three pieces from your catalogue, ranked, each with a sentence a salesperson would say.", sr: "Tri komada iz vašeg kataloga, rangirana, svaki sa rečenicom kakvu bi rekao prodavac." },
  "d.s4t": { en: "Preview & enquire", sr: "Pregled i upit" },
  "d.s4d": { en: "The piece appears on the customer's own wall, to scale. One tap sends you the lead.", sr: "Komad se pojavi na kupčevom zidu, u pravoj razmeri. Jedan dodir i upit stiže vama." },
  "d.pricing": { en: "Pricing", sr: "Cenovnik" },
  "d.month": { en: "/month", sr: "/mesečno" },
  "d.embed": { en: "One line on your website", sr: "Jedan red na vašem sajtu" },
  "d.embedNote": { en: "Paste it before </body>. A floating button appears; everything else is handled.", sr: "Nalepite pre </body>. Pojavi se plutajuće dugme; sve ostalo je rešeno." },
  "d.studio": { en: "Studio login", sr: "Prijava studija" },
  "d.cta": { en: "Become a studio", sr: "Postanite studio" },

  // ——— prijava firme (budući klijent platforme)
  "b.title": { en: "Become a SpaceMatch studio", sr: "Postanite SpaceMatch studio" },
  "b.sub": { en: "Tell us about your business and we set up your scanner, your branding and your catalogue.", sr: "Recite nam nešto o svom poslu i mi podešavamo vaš skener, vaš brend i vaš katalog." },
  "b.company": { en: "Company name", sr: "Naziv firme" },
  "b.person": { en: "Contact person", sr: "Kontakt osoba" },
  "b.email": { en: "Work email", sr: "Poslovni email" },
  "b.phone": { en: "Phone (optional)", sr: "Telefon (opciono)" },
  "b.website": { en: "Website", sr: "Sajt" },
  "b.vertical": { en: "What do you sell?", sr: "Šta prodajete?" },
  "b.size": { en: "How many products in your catalogue?", sr: "Koliko proizvoda ima vaš katalog?" },
  "b.plan": { en: "Plan you have in mind", sr: "Plan koji vam odgovara" },
  "b.msg": { en: "Anything else we should know?", sr: "Ima li još nešto što treba da znamo?" },
  "b.send": { en: "Send request", sr: "Pošalji zahtev" },
  "b.sent": { en: "Thank you. We will contact you within one working day with your studio key.", sr: "Hvala. Javljamo vam se u roku od jednog radnog dana sa ključem vašeg studija." },
  "b.bad": { en: "Please add a company name and a valid email.", sr: "Unesite naziv firme i ispravan email." },
  "b.cta": { en: "Become a studio", sr: "Postanite studio" },

  // ——— skener
  "s.start": { en: "Photograph your space", sr: "Fotografišite svoj prostor" },
  "s.hint": { en: "One photo of the wall or corner you want to change.", sr: "Jedna fotografija zida ili ugla koji želite da promenite." },
  "s.take": { en: "Take a photo", sr: "Napravi fotografiju" },
  "s.upload": { en: "Choose from gallery", sr: "Izaberi iz galerije" },
  "s.reading": { en: "Reading your space", sr: "Čitamo vaš prostor" },
  "s.r1": { en: "Light and colour", sr: "Svetlo i boja" },
  "s.r2": { en: "Style and materials", sr: "Stil i materijali" },
  "s.r3": { en: "Wall size", sr: "Veličina zida" },
  "s.r4": { en: "Matching the collection", sr: "Poređenje sa kolekcijom" },
  "s.profile": { en: "Your space", sr: "Vaš prostor" },
  "s.style": { en: "Style", sr: "Stil" },
  "s.light": { en: "Light", sr: "Svetlo" },
  "s.palette": { en: "Palette", sr: "Paleta" },
  "s.wall": { en: "Main wall", sr: "Glavni zid" },
  "s.see": { en: "See what fits", sr: "Vidi šta odgovara" },
  "s.match": { en: "match", sr: "poklapanje" },
  "s.preview": { en: "See it on your wall", sr: "Vidi na svom zidu" },
  "s.hide": { en: "Hide preview", sr: "Sakrij pregled" },
  "s.next": { en: "Show me another", sr: "Pokaži mi drugi" },
  "s.more": { en: "Browse all matches", sr: "Pogledaj sve predloge" },
  "s.ask": { en: "Ask about this piece", sr: "Pitaj o ovom komadu" },
  "s.again": { en: "Scan another room", sr: "Skeniraj drugu prostoriju" },
  "s.empty": { en: "This studio has not added its collection yet.", sr: "Ovaj studio još nije dodao svoju kolekciju." },
  "s.failed": { en: "We could not read that photo. Try one with more of the wall in frame.", sr: "Nismo uspeli da pročitamo tu fotografiju. Probajte sa više zida u kadru." },
  "s.size": { en: "Recommended size", sr: "Preporučena veličina" },
  "s.frame": { en: "Frame", sr: "Ram" },
  "s.scale": { en: "Size", sr: "Veličina" },
  "s.save": { en: "Save image", sr: "Sačuvaj sliku" },
  "s.share": { en: "Share", sr: "Podeli" },

  // ——— upit
  "q.title": { en: "Send an enquiry", sr: "Pošaljite upit" },
  "q.sub": { en: "The studio replies to you directly.", sr: "Studio vam odgovara direktno." },
  "q.name": { en: "Your name", sr: "Vaše ime" },
  "q.email": { en: "Email", sr: "Email" },
  "q.phone": { en: "Phone (optional)", sr: "Telefon (opciono)" },
  "q.msg": { en: "Message", sr: "Poruka" },
  "q.send": { en: "Send", sr: "Pošalji" },
  "q.sent": { en: "Sent. The studio will be in touch.", sr: "Poslato. Studio će vas kontaktirati." },
  "q.bad": { en: "Please check the email address.", sr: "Proverite email adresu." },

  // ——— studio
  "a.title": { en: "Studio", sr: "Studio" },
  "a.key": { en: "Studio key", sr: "Ključ studija" },
  "a.open": { en: "Open studio", sr: "Otvori studio" },
  "a.brand": { en: "Brand", sr: "Brend" },
  "a.catalogue": { en: "Collection", sr: "Kolekcija" },
  "a.leads": { en: "Enquiries", sr: "Upiti" },
  "a.insight": { en: "Insight", sr: "Uvidi" },
  "a.embed": { en: "Embed", sr: "Ugradnja" },
  "a.save": { en: "Save", sr: "Sačuvaj" },
  "a.saved": { en: "Saved", sr: "Sačuvano" },
  "a.add": { en: "Add piece", sr: "Dodaj komad" },
  "a.import": { en: "Import CSV", sr: "Uvezi CSV" },
  "a.scans": { en: "Scans", sr: "Skeniranja" },
  "a.products": { en: "Pieces", sr: "Komadi" },
  "a.clicks": { en: "Clicks", sr: "Klikovi" },
  "a.rooms": { en: "Rooms scanned", sr: "Skenirane prostorije" },
  "a.styles": { en: "Styles found", sr: "Pronađeni stilovi" },
  "a.none": { en: "Nothing yet.", sr: "Još ništa." },
  "a.del": { en: "Remove", sr: "Ukloni" },
  "a.wrong": { en: "That key does not open any studio.", sr: "Taj ključ ne otvara nijedan studio." },
};

let lang: "en" | "sr" = (() => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "sr" || q === "en") return q;
  return navigator.language?.toLowerCase().startsWith("sr") ? "sr" : "en";
})();

export const getLang = () => lang;
export const setLang = (l: "en" | "sr") => {
  lang = l;
};
/** Ime jezika na engleskom — šalje se modelu ("write in Serbian"). */
export const aiLanguage = () => (lang === "sr" ? "Serbian" : "English");
export const t = (k: string) => D[k]?.[lang] ?? k;
