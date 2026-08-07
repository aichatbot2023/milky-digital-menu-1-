# SpaceMatch AI — biznis model

Nicholas Family LTD, London. Verzija: avgust 2026.

Ovo nije prognoza nego plan sa proverljivim pretpostavkama. Svaka brojka
označena kao *pretpostavka* mora da se zameni stvarnim podatkom čim ga
budemo imali — prvih trideset demoa daju tačnije brojke od svake tabele.

---

## 1. Šta zapravo prodajemo

Ne prodajemo „AI". Prodajemo **prodavca koji radi 24 sata na sajtu klijenta**.

Kupac uslika svoju sobu i za pet sekundi dobije tri komada iz kataloga BAŠ
te firme, sa rečenicom zašto, i vidi komad na svom zidu u pravoj veličini.
Upit ide direktno firmi.

To rešava problem koji svaki prodavac nameštaja, rasvete i umetnina ima:
**kupac ne zna šta mu odgovara, pa ne kupuje ništa.** Konverzija na sajtu
prodavnice nameštaja je niska upravo zbog te nesigurnosti.

## 2. Zašto možemo da dominiramo — tri prednosti koje se ne kopiraju lako

**a) Trošak inferencije nam je nula.**
Ceo lanac (NVIDIA Nemotron → Gemini → OpenRouter → Groq → Lovable) je na
besplatnim nivoima. Konkurent na OpenAI Vision plaća po svakom skeniranju.
Na 10.000 skeniranja mesečno to je njihov trošak od nekoliko stotina evra
— naš nula. Možemo da idemo ispod svake njihove cene i da i dalje imamo
maržu preko 90%. **Ovo je jedina prednost koja ima rok trajanja** (besplatni
nivoi se menjaju), pa je koristimo dok traje da uzmemo tržište, a ne da
gradimo cenu koja ne može da preživi plaćeni model.

**b) Demo pre razgovora.**
Nijedan konkurent u prvom mejlu ne šalje gotov proizvod. Mi zalepimo link
klijentovog sajta i za minut imamo radni skener sa NJIHOVIM proizvodima.
Trošak: nula. Sales ciklus se skraćuje sa „hajde da vam objasnim" na
„evo, probajte". To je razlika između 2% i 15% odziva.

**c) Podaci koje niko drugi nema.**
Svaki skeniran prostor je zapis: kakav stil, koje boje, koliko svetla,
koje dimenzije zida — i šta je taj kupac posle toga tražio. Posle 50.000
skeniranja imamo mapu toga kako izgledaju stvarni domovi po tržištima.
Novi konkurent počinje od nule. Ovaj podatak vremenom vredi više od koda.

## 3. Cenovnik — tri sloja, ne jedan

Pretplata sama po sebi ostavlja novac na stolu kod klijenata kojima
sistem donese stvarnu prodaju. Zato tri sloja:

### Sloj 1 — pretplata (predvidiv prihod)

Lestvica je namerno strma. Galerija sa jednom prostorijom i lanac sa sto
salona ne dobijaju istu vrednost od istog alata: prvom je to lep dodatak,
drugom je prodajni kanal. Cena mora da prati tu razliku.

| Plan | Cena | Katalog | Skeniranja/mes. | Prodavnica |
|---|---|---|---|---|
| Starter | £89 | 150 | 750 | 1 |
| Professional | £349 | 1.500 | 7.500 | 3 |
| Business | £1.190 | 15.000 | 40.000 | 10 |
| Enterprise | od £3.500 | neograničeno | neograničeno | neograničeno |

Godišnje plaćanje je 20% jeftinije. Skeniranja preko plana naplaćuju se
**0,03 £ po komadu**; do 50% preko plana usluga radi normalno, iznad toga
staje — da račun ne pobegne klijentu bez njegovog znanja.

**Enterprise nije samo veći broj.** To je ugovor: jedinstvena prijava i
uloge korisnika, 99,9% dostupnosti kao obaveza, pravila rangiranja
podešena baš njihovom asortimanu, imenovani vođa naloga i vođeno uvođenje.
Za lanac sa pedeset salona realan godišnji ugovor je **£60.000–£150.000**,
a ne £4.788 koliko bi izašlo po staroj ceni. Ta razlika nije pohlepa nego
tačno merenje: njima jedan mesec rada donese više nego što ceo naš račun
košta za godinu.

### Sloj 2 — uvođenje (jednokratno)

| Veličina | Uvođenje |
|---|---|
| Starter / Professional | £0 (sami uvoze katalog) |
| Business | £1.500 — prenos kataloga i podešavanje |
| Enterprise | £6.000–£25.000 — spajanje sa njihovim sistemom, obuka, testni period |

Kod malih se uvođenje poklanja jer je prepreka. Kod velikih se **ne sme**
pokloniti: firma koja plati uvođenje ozbiljno shvata projekat i ne otkazuje
ga posle dva meseca.

### Sloj 3 — učinak (tu je gornja granica)

Klijent bira jedan od dva ugovora:

- **Niža pretplata + provizija:** cena nižeg plana + 3% na svaku prodaju
  koja je nastala iz upita preko skenera.
- **Viša pretplata bez provizije:** cena iz tabele, ništa više.

Alternativa za firme koje ne prate prodaju do kraja: **£8 po kvalifikovanom
upitu** iznad uključenih 20 mesečno.

## 4. Ekonomika po klijentu

*Pretpostavke, za proveru posle prvih 30 klijenata:*

Sa novom lestvicom prosek zavisi od toga koga lovimo. Zato dve kolone —
mali klijent i srednji/veliki:

| Stavka | Mali (Starter/Pro) | Veliki (Business/Enterprise) |
|---|---|---|
| Prosečan prihod mesečno | ~£220 | ~£1.900 |
| Trošak posluživanja | ~£2 | ~£25 |
| Bruto marža | ~99% | ~98% |
| Trošak sticanja (CAC) | £40–60 | £900–2.500 (duži ciklus, sastanci) |
| Povraćaj CAC-a | manje od mesec dana | 1–2 meseca |
| Očekivano trajanje | 24 meseca *(pretpostavka)* | 36 meseci *(pretpostavka)* |
| Vrednost klijenta (LTV) | ~£5.300 | ~£68.000 + uvođenje |

**Deset velikih klijenata vredi kao sto pedeset malih.** Zato mali plan
postoji da puni levak i pravi studije slučaja, a ne da nosi prihod.

Kod malih klijenata odnos LTV:CAC je nerealno dobar i **znači samo jedno:
rast ograničava broj kontakata koje napravimo, a ne novac.** Zato se demo
pravi za minut. Kod velikih odnos je i dalje odličan (oko 30:1), ali tu
ograničenje nije broj mejlova nego broj sastanaka koje možemo da održimo —
zato Enterprise ide preko preporuke i partnera, ne preko liste.

## 5. Kako rastemo — dvanaest meseci

**Mesec 1–2: ručno, sa demoom.**
200 demoa: galerije, nameštaj, rasveta — UK i Balkan. Sve preko CRM-a:
uvezi listu → napravi demo → pošalji ponudu na njihovom jeziku.
Cilj: **10 klijenata koji plaćaju.** Ne više — hoćemo da naučimo ko
konvertuje, ne da jurimo broj. Ovde su svi na Starteru i Professionalu;
oni nisu prihod, oni su dokaz.

**Mesec 3–4: fokus na najbolju vertikalu.**
Ona koja je konvertovala najbolje dobija sve vreme. Prva studija slučaja
sa PRAVIM brojevima klijenta (koliko upita, koliko prodaje). Bez te
studije ne može dalje.
Cilj: **30 klijenata i prva dva Business ugovora, ~£12.000 MRR.**

**Mesec 5–8: kanal partnera — ovo je poluga.**
Web agencije i Shopify partneri prodaju našim klijentima svakog dana.
Dajemo im **30% ponavljajuće provizije** doživotno. Agencija sa 40
klijenata iz sveta nameštaja vredi kao 40 naših hladnih kontakata, a
košta nas samo maržu.
Cilj: **10 partnera, 100 klijenata, ~£40.000 MRR.**

**Mesec 9–12: samoposluživanje.**
Aplikacija u Shopify App Store i WooCommerce dodatak. Klijent sam
instalira, katalog se uvozi automatski (već imamo čitač), plaća karticom.
Tu prestaje da nas ograničava broj naših mejlova.
Cilj: **300 malih klijenata i 3–5 Enterprise ugovora, ~£120.000 MRR** plus prihod od učinka i uvođenja.

## 6. Krajnja igra — od alata do tržišta

Ovo je jedina stvar koja SpaceMatch pretvara iz dobrog posla u veliki.

Kada budemo imali 300 studija sa katalozima, pravimo **potrošačku
aplikaciju**: kupac uslika sobu i vidi predloge iz SVIH kataloga odjednom.
Tada mi držimo tražnju, a ne alat. Naplata prelazi na proviziju od
prodaje i na plaćeno isticanje — model tržišta, ne modela pretplate.

Redosled je bitan: **prvo alat, pa katalozi, pa tržište.** Ko krene od
tržišta, nema šta da pokaže kupcu prvog dana.

## 7. Kome prodajemo prvo — i zašto tim redom

1. **Galerije i prodavci umetnina** — najlakši demo (slika, dimenzije,
   stil), najveća bol (kupac ne zna koja veličina ide iznad kauča),
   najveća marža po komadu. Počinjemo ovde.
2. **Rasveta** — jasne dimenzije, jak vizuelni efekat.
3. **Nameštaj** — najveće tržište, ali najduži ciklus odlučivanja.
4. **Kuhinje i podovi** — velika vrednost porudžbine, spor prodajni proces
   kod klijenta; ostavljamo za kasnije.
5. **Lanci nameštaja (Enterprise)** — najduži ciklus (šest do dvanaest
   meseci, tender, pravna služba), ali jedan potpis vredi kao cela godina
   rada sa malima. Ovde se ne ide hladnim mejlom nego preko preporuke
   prvog zadovoljnog srednjeg klijenta.
6. **Agencije za nekretnine** — druga upotreba (uređenje praznog stana);
   drugačiji jezik prodaje, čeka posebnu kampanju.

## 8. Rizici i odgovori

| Rizik | Odgovor |
|---|---|
| Besplatni AI nivoi se ukinu ili ograniče | Cena je već postavljena tako da podnese plaćenu inferenciju (~£0,004 po skeniranju). Marža pada sa 98% na ~92%. Nije egzistencijalno. |
| Sajt klijenta je SPA i ne može da se pročita | CSV uvoz i ručni unos već postoje; demo se pravi za pet minuta umesto za jedan. |
| Slike proizvoda u demou se povlače sa njihovog sajta | To su NJIHOVE slike, u demou napravljenom za njih. Kod potpisa katalog se prebacuje na njihove trajne linkove. Demo naloge treba gasiti posle 30 dana. |
| Veliki igrač (IKEA, Houzz) uradi isto | Oni to rade samo za svoj katalog. Naša vrednost je baš u tome što radimo za bilo čiji — i pod njihovim imenom. |
| Klijent otkaže posle tri meseca | Upiti i analitika ostaju kod nas; što duže rade, to im više vredi. Godišnje plaćanje sa dva meseca gratis. |
| Veliki traži cenu malog | Ne spuštamo cenu, spuštamo obim: manje prodavnica u planu. Popust bez smanjenja obima obara celu lestvicu, jer se cene među lancima znaju. |
| Enterprise traži funkciju koju nemamo | Naplaćuje se kao razvoj, ali ostaje u proizvodu i za ostale. Nikad ne pravimo granu koda samo za jednog klijenta. |
| GDPR — fotografije tuđih domova | Slika se obrađuje prolazno i ne čuva se; čuva se samo opis prostora bez lične informacije. To mora ostati tako. |

## 9. Šta meriti (i ništa drugo)

1. Broj poslatih demoa nedeljno.
2. Procenat demoa koji dobiju odgovor.
3. Procenat odgovora koji postanu klijenti.
4. MRR i odliv klijenata.
5. Kod klijenata: skeniranja → upiti → prodaja. **Ovo je jedina brojka
   koja produžava ugovor.**

Sve ostalo je zanimljivo, ali ne menja odluke.
