# SpaceMatch AI — spisak vizuala za generisanje

Nicholas Family LTD. Verzija: avgust 2026.

Kada slike budu gotove, pošalji ih pod **tačno ovim imenima**. Sve idu u
`public/spacematch/img/` i kod ih očekuje pod tim putanjama — ništa se ne
prepravlja, samo se ubace.

---

## Pravila koja važe za SVE slike

**1. Nijedna slika ne sme da sadrži tekst.**
Sajt radi na trinaest jezika. Slovo zapečeno u sliku ostaje na engleskom i
odmah se vidi da je stranica prevedena „na pola". Sav tekst je u kodu.

**2. Nijedan logo, brend ni prepoznatljiv proizvod.**
Ni IKEA, ni Apple uređaji sa jabukom, ni poznat komad nameštaja koji se
prepoznaje. Bilo šta od toga je tuđi znak na našem sajtu.

**3. Ista paleta u svakom kadru.**
Topli neutralni tonovi + duboko tirkizna kao jedini akcenat:

```
#0b1a17  skoro crna zelena (tekst)
#0f766e  tirkizna (akcenat)
#0c5c55  tamna tirkizna
#e9e2d8  topli pesak
#f5f8f7  skoro bela
#c9bfae  bež
```

**4. Isto svetlo u svakom kadru.**
Meko dnevno svetlo sa strane, kasno popodne, bez bleštavila i bez tvrdih
senki. Nikakvo studijsko svetlo, nikakav HDR.

**5. Bez ljudi u kadru** osim ako je izričito traženo. Ruka koja drži
telefon je u redu; lice nije — AI lica na poslovnom sajtu deluju lažno.

**6. Format i težina.**
Šalji **PNG ili JPG u punoj rezoluciji**, ja pretvaram u WebP i stiskam.
Ne diraj ih ničim posle generisanja.

---

## Zajednički deo prompta (zalepi na POČETAK svakog prompta)

```
Photorealistic interior photography, shot on a full-frame camera with a 35mm lens,
soft late-afternoon daylight coming from one side, no harsh shadows, no flash.
Warm neutral palette: sand #e9e2d8, beige #c9bfae, off-white #f5f8f7,
with a single deep teal accent #0f766e used sparingly.
Calm, uncluttered, editorial magazine styling. Shallow but honest depth of field.
No text, no letters, no numbers, no logos, no watermarks, no brand names.
```

## Zajednički negativni prompt (zalepi na KRAJ svakog prompta)

```
--no text, letters, words, numbers, watermark, logo, brand, signature,
cluttered, messy, oversaturated, HDR, neon, purple, magenta, fisheye,
distorted perspective, plastic look, cartoon, illustration, 3d render,
people faces, crowd, dirty, damaged
```

---

# GRUPA 1 — Delatnosti (6 slika) · NAJVAŽNIJE

Idu u mrežu „Napravljeno za svaki prostor". Ovo je prvo mesto gde
posetilac vidi da li razumemo njegov posao, pa ove slike prvo uradi.

**Dimenzije: 1000 × 920 px** (skoro kvadrat, malo niže od širine)

### `ind-furniture.jpg`
```
[zajednički deo]
A calm modern living room corner with a low three-seat linen sofa in warm sand colour,
one round oak side table, a single deep teal cushion. Plain off-white wall behind,
wide-plank oak floor. Nothing on the walls. Composition centred on the sofa.
[negativni deo]
```

### `ind-art.jpg`
```
[zajednički deo]
An empty off-white gallery wall with three small framed abstract prints hung in a row,
thin light oak frames, generous space around them. A concrete floor and the edge of a
wooden bench in the lower corner. The wall is the subject, the frames are small.
[negativni deo]
```

### `ind-lighting.jpg`
```
[zajednički deo]
A single sculptural pendant lamp with a matte ceramic shade hanging over an empty
oak dining table, switched on with a warm glow. Plain sand-coloured wall behind,
lots of empty space above the table. The lamp is the only object in focus.
[negativni deo]
```

### `ind-kitchen.jpg`
```
[zajednički deo]
A minimal kitchen worktop in warm off-white, matte handleless cabinets,
a light stone splashback, one ceramic bowl and a small olive plant.
Daylight from a window on the left. No appliances visible, no clutter.
[negativni deo]
```

### `ind-flooring.jpg`
```
[zajednički deo]
A close low-angle view of a large hand-woven wool rug in sand and beige tones
lying on a wide-plank oak floor, the corner of a linen armchair leg entering
the frame at the top. Texture of the weave clearly visible.
[negativni deo]
```

### `ind-realestate.jpg`
```
[zajednički deo]
An empty unfurnished apartment room with white walls, oak herringbone floor,
one tall window with sheer curtains, afternoon light falling across the floor.
Completely empty — no furniture at all. Feels full of possibility, not abandoned.
[negativni deo]
```

---

# GRUPA 2 — Četiri koraka (4 slike)

Idu u kartice „Kako radi za osam sekundi". Svaka mora da priča svoj korak
bez ijedne reči.

**Dimenzije: 1200 × 750 px** (16:10)

### `step-1-photograph.jpg`
```
[zajednički deo]
A hand holding a smartphone in portrait orientation, photographing a living room wall.
Seen from slightly behind and above the hand. The phone screen shows the same room
it is pointed at. Only the hand and forearm visible, no face, neutral sleeve.
[negativni deo]
```

### `step-2-understand.jpg`
```
[zajednički deo]
The same living room corner, but the image is treated: a subtle deep teal #0f766e
gradient wash over the photograph, as if the space is being read. Very light,
elegant, not a sci-fi hologram. The furniture stays clearly recognisable underneath.
[negativni deo]
```

### `step-3-recommend.jpg`
```
[zajednički deo]
Three interior objects arranged side by side on a plain sand background, evenly spaced,
photographed straight on: a framed abstract print, a ceramic table lamp, and a folded
wool throw. Product-catalogue styling, soft shadow under each.
[negativni deo]
```

### `step-4-preview.jpg`
```
[zajednički deo]
A living room wall above a sofa with one large framed abstract artwork hanging on it,
photographed straight on so the wall fills the frame. The artwork is clearly the
finished result — the room looks complete.
[negativni deo]
```

---

# GRUPA 3 — Hero (4 slike)

Idu u maketu telefona i laptopa u vrhu stranice. Sada su tu prazni
pravougaonici — sa ovim slikama vrh stranice odmah izgleda kao pravi
proizvod.

### `hero-room.jpg` — **1200 × 800 px** (3:2)
```
[zajednički deo]
A living room photographed by someone standing in the doorway: a linen sofa against
a large empty off-white wall, oak floor, one plant in the corner. The empty wall
takes up the upper half of the frame. Slightly casual framing, as if taken on a phone.
[negativni deo]
```

### `hero-piece-1.jpg`, `hero-piece-2.jpg`, `hero-piece-3.jpg` — **800 × 800 px**
```
[zajednički deo]
A single interior product photographed straight on, centred, on a plain
[sand #e9e2d8 / off-white #f5f8f7 / warm beige #c9bfae] background,
soft shadow beneath it, catalogue styling with generous margin around the object.
Object: [1: a framed abstract landscape print in a thin oak frame]
        [2: a ceramic table lamp with a linen shade]
        [3: a rolled wool rug standing upright]
[negativni deo]
```
> Uradi ih kao seriju od tri, sa **istim svetlom i istim rastojanjem** —
> stoje jedna do druge i svaka razlika se vidi.

---

# GRUPA 4 — „Probaj sam" (1 slika)

### `try-room.jpg` — **1200 × 900 px** (4:3)
```
[zajednički deo]
A bedroom photographed from the foot of the bed: a made bed with linen bedding in
warm neutral tones, a large empty wall above the headboard, one bedside table with
a small lamp. The empty wall above the bed is the focus of the composition.
[negativni deo]
```

---

# GRUPA 5 — Demo katalog (12 slika) · za pokazivanje klijentima

Ovo su „umetnine" demo galerije koju šalješ potencijalnim klijentima.
Sada stoje nasumične slike sa interneta; sa ovima demo izgleda kao prava
galerija.

**Dimenzije: 900 × 1200 px** (3:4, uspravno) · imena `art-01.jpg` … `art-12.jpg`

Za sve važi isti okvir prompta:
```
A single abstract artwork photographed flat and straight on, filling the frame,
no frame and no wall visible, even lighting, visible canvas or paper texture.
Style: [OPIS ISPOD]
[negativni deo]
```

| Fajl | Opis stila za ubaciti |
|---|---|
| `art-01` | soft horizontal seascape in pale grey-green and sand, minimal, calm |
| `art-02` | warm textured abstract with copper and deep brown, thick brushstrokes |
| `art-03` | mid-century figure line drawing in charcoal on cream paper |
| `art-04` | strict black and white geometric grid, hard edges, screen-print look |
| `art-05` | wide three-part coastal landscape in soft greens and off-white |
| `art-06` | japanese sumi ink brush study, single black stroke on rice paper |
| `art-07` | industrial photographic abstract of concrete and steel, cool grey |
| `art-08` | botanical fern study in deep green with gold leaf accents |
| `art-09` | sand-toned minimal abstract, two soft blocks of colour, unframed linen |
| `art-10` | dark moody floral oil painting, deep green and gold, heavy impasto |
| `art-11` | small brutalist architecture photograph, grey concrete, high contrast |
| `art-12` | wide panoramic seascape in pale blue and off-white, very calm |

> Ako ti je dvanaest previše, uradi prvih šest — bolje šest odličnih nego
> dvanaest osrednjih.

---

# GRUPA 6 — Deljenje na mrežama (1 slika)

### `og-spacematch.jpg` — **1200 × 630 px**
```
[zajednički deo]
A living room wall seen straight on, left half completely empty off-white wall,
right half with a large framed abstract artwork already hanging. The contrast
between empty and finished is the whole idea. Composition leaves the left third
visually quiet.
[negativni deo]
```
> Ova jedina sme malo da „priča" kompozicijom, jer se pojavljuje kao
> sličica kad se link deli na LinkedIn-u i WhatsApp-u. Tekst i dalje NE.

---

## Redosled po važnosti

Ako radiš u etapama, ovim redom se najbrže vidi razlika:

1. **Grupa 1** (6 delatnosti) — najveća površina na stranici
2. **Grupa 3** (4 hero) — prvo što posetilac vidi
3. **Grupa 5** (6–12 umetnina) — demo koji šalješ klijentima
4. **Grupa 2** (4 koraka)
5. **Grupa 4 i 6** (2 slike)

**Ukupno: 28 slika** (ili 22 ako radiš šest umetnina).

## Šta ja radim kada ih pošalješ

Pretvaram u WebP sa rezervom u JPG, pravim manje verzije za telefone,
postavljam `width`/`height` da se raspored ne pomera dok se učitavaju,
uključujem lenjo učitavanje svemu ispod prvog ekrana i ubacujem ih na
mesta koja su već pripremljena u kodu. Ti ne diraš ništa.
