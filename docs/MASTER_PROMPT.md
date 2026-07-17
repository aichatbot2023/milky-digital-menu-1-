# SafeNest AI — Master Prompt (specifikacija proizvoda)

> Ovo je "master prompt" aplikacije: kompletna specifikacija koju svaki programer,
> dizajner ili AI agent može da koristi kao jedini izvor istine za razvoj proizvoda.

## 1. Vizija (jedna rečenica)

**SafeNest AI pomaže roditeljima da za 30 sekundi, kamerom telefona, pronađu i uklone
opasnosti po decu u bilo kom prostoru — kod kuće, u restoranu, na odmoru.**

## 2. Problem

- Nezgode u domu su vodeći uzrok povreda dece do 5 godina (padovi, trovanja, opekotine,
  gušenje, davljenje, strujni udar).
- Roditelji ne znaju šta je opasno za KOJI uzrast: ono što je bezbedno za bebu od 3 meseca
  postaje opasno kad beba počne da puzi, hoda, penje se.
- Postojeći sadržaji (članci, checkliste) su generički — niko ne gleda TVOJU sobu.

## 3. Rešenje

Korisnik uperi kameru (ili slika/snimi prostor) → AI vizuelno analizira scenu →
označi opasnosti markerima direktno na slici → dodir na marker otvara karticu:
**zašto je opasno + statistika povreda + kako to rešiti odmah**.
AI prilagođava analizu uzrastu deteta iz profila.

## 4. Platforme

| Platforma | Tehnologija |
|---|---|
| iOS | Capacitor (nativni WebView + Camera plugin) |
| Android | Capacitor |
| macOS | PWA / Capacitor + Electron target |
| Web (demo/marketing) | ista React aplikacija |

Jedan kod (React + TypeScript + Vite), Capacitor omotač za prodavnice aplikacija.

## 5. Ključne funkcije (MVP)

1. **Skeniranje prostora** — kamera uživo ili fotografija iz galerije; izbor tipa
   prostora (dnevna soba, kuhinja, kupatilo, spavaća soba, restoranski sto, dvorište/terasa).
2. **AI detekcija opasnosti** — Claude vision model vraća strukturiranu listu opasnosti sa:
   - normalizovanim bounding box-om (0–1) za mapiranje markera na sliku,
   - nazivom objekta/zone, kategorijom (pad, gušenje, trovanje, opekotina, struja,
     sečenje, davljenje, prignječenje),
   - ozbiljnošću (kritično / visoko / srednje / nisko),
   - objašnjenjem ZAŠTO je opasno za konkretan uzrast,
   - statistikom povreda (poznati podaci SZO/CDC/EU o učestalosti tog tipa povrede),
   - konkretnim korakom za rešavanje (ukloni, zaključaj, montiraj zaštitu…).
3. **Interaktivna mapa opasnosti** — markeri na slici, boja po ozbiljnosti; klik otvara
   detaljnu karticu.
4. **Profili dece** — ime + uzrast (0–6m, 6–12m, 1–2g, 2–4g, 4–7g, 7+); analiza se
   prilagođava izabranom detetu; više dece = unija rizika najosetljivijeg uzrasta.
5. **Istorija skeniranja** — sačuvani skenovi sa rezultatima, checklist "rešeno/nerešeno",
   safety score prostora (0–100).

## 6. Funkcije v2 (posle lansiranja)

- Video/live mod (kontinuirano skeniranje dok korisnik hoda kroz stan)
- AR markeri (ARKit/ARCore)
- Podsetnici: "Dete je napunilo 12 meseci — ponovo skeniraj, novi rizici penjanja"
- Deljenje izveštaja (baka/deka, dadilja, iznajmljivač apartmana)
- B2B izveštaji za vrtiće, hotele, Airbnb domaćine

## 7. AI sistem prompt (koristi se u `api/analyze.ts`)

Model: `claude-opus-4-8` (vision). Ulaz: fotografija (base64) + tip prostora + uzrast deteta.
Izlaz: striktni JSON (structured outputs, `output_config.format`).

```
Ti si sertifikovani ekspert za bezbednost dece (childproofing) sa znanjem pedijatrijske
epidemiologije povreda (SZO, CDC, EU Child Safety Alliance). Analiziraš fotografiju
prostora i identifikuješ SVE vizuelno uočljive opasnosti za dete uzrasta {AGE}.

Za svaku opasnost vrati:
- label: kratak naziv objekta/zone
- category: fall|choking|poisoning|burn|electric|cutting|drowning|crush|strangulation|other
- severity: critical|high|medium|low (prilagođeno uzrastu {AGE})
- box: {x, y, w, h} normalizovano 0-1 na dimenzije slike
- why: 2-3 rečenice zašto je to opasno baš za ovaj uzrast (razvojne sposobnosti:
  puzanje, hvatanje, penjanje, stavljanje u usta...)
- stats: poznata statistika za taj tip povrede (npr. "Padovi čine ~44% povreda dece
  do 4 god. koje zahtevaju hitnu pomoć (CDC)"). Ako nemaš pouzdan podatak, opšta
  epidemiološka činjenica — nikad izmišljeni brojevi.
- fix: konkretan, odmah izvodljiv korak (šta ukloniti, kupiti, montirati)

Pravila:
- Prijavi samo ono što se VIDI na slici; ne izmišljaj objekte.
- Ozbiljnost zavisi od uzrasta: kablovi su kritični za dete koje puzi, manje za bebu od 2 meseca.
- Uključi i ZONE (ivica stola u visini glave, stepenice bez kapije, prozor bez zaštite,
  terasa/ograda sa razmakom šipki > 10 cm, bazen/voda bez nadzora).
- Vrati i safety_score (0-100) i summary (2 rečenice, ohrabrujući ton).
- Odgovori na srpskom jeziku.
```

## 8. Arhitektura

```
[App: React+TS+Capacitor]
   ├─ Camera / Photo picker (Capacitor Camera plugin / <input capture>)
   ├─ Lokalno stanje: profili dece + istorija (localStorage / Capacitor Preferences)
   └─ POST /api/analyze  (slika base64 + roomType + childAge)
            │
     [Serverless backend — Vercel function]
            └─ Anthropic Messages API (claude-opus-4-8, vision, structured outputs)
```

- API ključ NIKAD u aplikaciji — samo na backend-u (`ANTHROPIC_API_KEY` env var).
- Slike se ne čuvaju na serveru (privacy by design; GDPR friendly).

## 9. UX principi

- Prvo skeniranje bez registracije (aha-momenat pre naloga).
- Marker boje: crvena (kritično), narandžasta (visoko), žuta (srednje), plava (nisko).
- Ton: smiren, ohrabrujući — bez izazivanja panike; uvek uz rešenje.
- Jedan glavni CTA po ekranu: "Skeniraj prostor".

## 10. Metrike uspeha

- Aktivacija: % korisnika koji završe prvo skeniranje (> 60%)
- "Rešeno" akcije po skenu (> 2)
- D7 retencija (> 25%), konverzija free→premium (> 4%)
