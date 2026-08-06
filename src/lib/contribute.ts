/**
 * KAKO APLIKACIJA UČI OD RODITELJA — i šta pri tom NIKAD ne radi.
 *
 * Učenje na uređaju (`learning.ts`) pomera prag poverenja po klasi i tako
 * smiruje lažne uzbune — ali samo na TOM telefonu. Model ostaje isti kakav je
 * bio. Da bi se sam model popravljao, ispravke moraju negde da se skupe: kad
 * stotinu roditelja kaže „ovo nije utičnica", to je stotinu označenih primera
 * kakve nijedan javni skup podataka nema, jer su iz pravih stanova.
 *
 * To znači slanje slike iz nečije kuće, pa pravila moraju biti stroga i
 * moraju važiti bez izuzetka:
 *
 *   1. PODRAZUMEVANO JE ISKLJUČENO. Ćutanje nije pristanak. Dok roditelj
 *      izričito ne uključi, sa telefona ne odlazi nijedan piksel.
 *   2. ŠALJE SE SAMO ISEČAK OZNAČENOG PREDMETA, nikad cela fotografija sobe.
 *      Za učenje je isečak i jedino što vredi; ostatak sobe je tuđ život.
 *   3. Isečak se smanjuje na 224 px. Dovoljno da se predmet prepozna,
 *      premalo da se čita šta piše na papirima ili prepozna lice u dnu kadra.
 *   4. Ne šalje se ništa što bi vezalo isečak za osobu — ni nalog, ni ime
 *      deteta, ni vreme skeniranja, ni gde je snimljeno.
 *   5. Gasi se jednim dodirom i tada prestaje odmah.
 *
 * Slanje je uvek „najbolji trud": ako padne, roditelj to ne vidi i ništa se
 * ne prekida. Doprinos je poklon, ne uslov za rad aplikacije.
 */
import { OMNI_ANON_KEY, DEFAULT_OMNI_URL } from "./analyze";
import type { Hazard } from "../types";

const CONSENT_KEY = "safenest.contribute";
/** Isečak se šalje na ovoj ivici — dovoljno za učenje, premalo za čitanje. */
const CROP_PX = 224;
/** Gornja granica po sesiji, da doprinos ne postane odliv podataka. */
const MAX_PER_SESSION = 12;

let sentThisSession = 0;

/** Da li je roditelj izričito pristao da pomaže u učenju. */
export function contributes(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Uključi ili isključi doprinos. Isključivanje deluje odmah. */
export function setContributes(on: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, on ? "1" : "0");
  } catch {
    /* privatni mod — ostaje isključeno, što je bezbedna strana */
  }
}

/** Isečak označenog predmeta, smanjen i bez ostatka sobe. */
function cropOf(img: HTMLImageElement, box: Hazard["box"]): string | null {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  // Malo šire od okvira: predmetu treba ivica konteksta da bi se učio, ali
  // ne toliko da uđe pola prostorije.
  const pad = 0.12;
  const x = Math.max(0, (box.x - box.w * pad) * W);
  const y = Math.max(0, (box.y - box.h * pad) * H);
  const w = Math.min(W - x, box.w * (1 + 2 * pad) * W);
  const h = Math.min(H - y, box.h * (1 + 2 * pad) * H);
  if (w < 16 || h < 16) return null;

  const k = Math.min(1, CROP_PX / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(16, Math.round(w * k));
  c.height = Math.max(16, Math.round(h * k));
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

/**
 * Pošalji jednu ispravku: isečak predmeta i sud roditelja o njemu.
 *
 * `verdict` je ono što je roditelj rekao dodirom na 👍/👎, dakle da li je
 * nalaz bio tačan. `claim` je ime klase koje je model tvrdio — bez njega
 * isečak nije podatak za učenje nego samo slika.
 */
export async function contribute(
  imageDataUrl: string,
  hazard: Hazard,
  verdict: boolean,
): Promise<void> {
  if (!contributes()) return;
  if (sentThisSession >= MAX_PER_SESSION) return;
  const claim = hazard.sourceClass;
  if (!claim) return; // nalaz iz oblaka nema klasu modela — nema šta da uči

  try {
    const img = await new Promise<HTMLImageElement | null>((ok) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => ok(null);
      el.src = imageDataUrl;
    });
    if (!img) return;
    const crop = cropOf(img, hazard.box);
    if (!crop) return;

    sentThisSession += 1;
    // Ide kao RADNJA postojeće funkcije, ne kao zasebna: projekat je
    // dostigao dozvoljen broj funkcija, a veći plan se ne plaća.
    await fetch(DEFAULT_OMNI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OMNI_ANON_KEY}`,
        apikey: OMNI_ANON_KEY,
      },
      body: JSON.stringify({ action: "learn", claim, correct: verdict, crop }),
    });
  } catch {
    // Doprinos koji padne se ne pominje i ne pokušava ponovo. Roditelj je
    // došao da zaštiti dete, ne da otklanja naše greške u mreži.
  }
}
