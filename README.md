# 🛡️ SafeNest AI

AI aplikacija za roditelje: **skenirajte prostor kamerom** (dnevna soba, kuhinja,
restoranski sto, terasa…) i AI vizuelno **označi opasnosti po dete** direktno na slici.
Klik na marker otvara karticu: **zašto je opasno, statistika povreda i kako to rešiti** —
sve prilagođeno **uzrastu deteta** iz profila.

Platforme: **iOS + Android** (Capacitor) i **macOS/web** (ista React aplikacija).

## Dokumentacija

- [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) — master prompt / kompletna specifikacija proizvoda + AI sistem prompt
- [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md) — biznis model, cene, go-to-market plan

## Arhitektura

```
React + TypeScript + Vite  ──►  Capacitor (iOS / Android)  /  PWA (macOS, web)
        │
        └── POST /api/analyze  (Vercel serverless funkcija)
                 └── Anthropic Claude (claude-opus-4-8, vision + structured outputs)
```

- API ključ postoji **samo na backend-u** (`ANTHROPIC_API_KEY`).
- Slike se ne čuvaju na serveru; profili dece i istorija skenova su lokalno na uređaju.

## Pokretanje (web / razvoj)

```bash
npm install
cp .env.example .env      # podesi ANTHROPIC_API_KEY (za backend)
npm run dev               # frontend na http://localhost:5173
```

Za lokalni backend najlakše je `vercel dev` (pokreće i `/api/analyze`):

```bash
npm i -g vercel
vercel dev
```

## Build za mobilne platforme

```bash
npm run cap:sync      # build + sync web koda u native projekte
npx cap add ios       # prvi put
npx cap add android   # prvi put
npm run cap:ios       # otvara Xcode
npm run cap:android   # otvara Android Studio
```

> iOS zahteva `NSCameraUsageDescription` u Info.plist (Capacitor Camera ga dodaje pri sync-u).
> macOS: aplikacija radi kao PWA u Safari/Chrome; za Mac App Store koristiti
> `@capacitor-community/electron` target.

## Deploy backend-a

1. Povežite repo na [Vercel](https://vercel.com) — `api/analyze.ts` se automatski deploy-uje.
2. Dodajte `ANTHROPIC_API_KEY` u Environment Variables.
3. U mobilnoj aplikaciji postavite `VITE_API_URL=https://vas-projekat.vercel.app` pre builda.

## Napomena

SafeNest AI je pomoćni alat i ne zamenjuje nadzor odrasle osobe.

---

*Prethodni sadržaj ovog repoa (Milky Digital Menu) nalazi se u git istoriji (`git log`).*
