# SpaceMatch AI — vizuali

Nicholas Family LTD. Verzija: avgust 2026.

**Svih 28 slika je urađeno i stoji u `public/spacematch/img/`.** Ne treba ih
nigde naručivati niti plaćati: pravi ih naš NVIDIA ključ, isti onaj kojim
radi i ostatak sistema.

```
python3 tools/spacematch-images.py --key <ADMIN_KEY>
```

Bez dodatnih imena skripta preskoči sve što već postoji. Za jednu sliku:

```
python3 tools/spacematch-images.py --key <ADMIN_KEY> --force ind-kitchen
```

Promptovi žive u samoj skripti, po jedan uz svako ime — tamo se menjaju, ne
u ovom fajlu. Skripta traži od modela najbliži kadar koji on uopšte prima,
kropuje ga na tačan odnos iz spiska ispod, i snima tri fajla: `.jpg` za
starije pregledače, `.webp` i `@0.5x.webp` za telefone.

---

## Šta je gde

| Fajl | Dimenzije | Gde se vidi |
|---|---|---|
| `ind-furniture` `ind-art` `ind-lighting` `ind-kitchen` `ind-flooring` `ind-realestate` | 1000 × 920 | mreža „Napravljeno za svaki prostor" |
| `step-1-photograph` `step-2-understand` `step-3-recommend` `step-4-preview` | 1200 × 750 | četiri koraka |
| `hero-room` | 1200 × 800 | maketa telefona u vrhu |
| `hero-piece-1` `hero-piece-2` `hero-piece-3` | 800 × 800 | tri kartice u maketi laptopa |
| `try-room` | 1200 × 900 | dugme „Ili probajte na našoj sobi" |
| `art-01` … `art-12` | 900 × 1200 | katalog demo galerije |
| `og-spacematch` | 1200 × 630 | sličica kad se link deli |

---

## Pravila koja važe za sve

**Nijedna slika nema tekst.** Sajt radi na trinaest jezika; slovo zapečeno u
sliku ostalo bi na engleskom i odmah bi se videlo da je stranica prevedena
„na pola".

**Nijedan logo, brend ni prepoznatljiv proizvod.**

**Ista paleta u svakom kadru** — topli neutralni tonovi, duboko tirkizna kao
jedini akcenat:

```
#0b1a17  skoro crna zelena      #e9e2d8  topli pesak
#0f766e  tirkizna               #f5f8f7  skoro bela
#0c5c55  tamna tirkizna         #c9bfae  bež
```

**Isto svetlo u svakom kadru** — meko dnevno svetlo sa strane, kasno
popodne, bez bleštavila i bez tvrdih senki.

**Bez ljudi u kadru.** Ruka koja drži telefon je u redu; lice nije.

---

## Tri stvari koje model sam ne ume

Zapisane su da se ne otkrivaju ponovo:

**Drugi korak nije prompt nego obrada.** Kad se od modela traži „tirkizni
preliv preko fotografije", on jednostavno okreči zid u tirkizno. Zato se
soba generiše čista, a preliv crta `teal_wash()` u tačnoj boji marke.

**Radovi u katalogu hoće da postanu galerija.** Na svaki opis slike model
naslika uramljeno platno obešeno o zid, pa je u mreži sličica pola radova
bilo sa zidom okolo. Prompt to traži izričito, a `art_crop()` posle toga
iseca zid ako se ipak pojavi — i namerno odustaje kad nije siguran, jer bi
minimalnom radu od dva polja boje pogrešan rez pojeo pola kompozicije.

**Crtež figure ne prolazi.** Svaki opis ljudskog tela vraća crn
pravougaonik — filtar sa strane modela. `art-03` zato nosi apstraktnu
linijsku kompoziciju u istom mid-century duhu, a proizvod u demo katalogu
zove se `Studio Line, 1962`.

---

## Demo katalog

Dvanaest radova iz demo galerije više ne visi o nasumičnim slikama sa
interneta. Katalog se ponovo pravi jednom komandom i bezbedno je pokrenuti
je više puta:

```
python3 tools/spacematch-seed-demo.py --key <sm_ ključ demo studija>
```
