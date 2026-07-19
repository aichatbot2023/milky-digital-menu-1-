/**
 * Pretplata: 7 dana potpuno besplatno, zatim 7 € mesečno.
 * Probni period se meri od prvog pokretanja (localStorage). Plaćanje ide
 * preko eksternog checkout linka (Stripe Payment Link — VITE_CHECKOUT_URL);
 * dok link nije podešen, dugme vodi na kontakt mejl. Nakon uplate korisnik
 * dobija aktivacioni kod koji unosi u aplikaciju.
 */

const TRIAL_KEY = "safenest.trialStart";
const SUB_KEY = "safenest.subscribed";

export const TRIAL_DAYS = 7;
export const PRICE_LABEL = "7 € mesečno";

/** Stripe Payment Link (podešava se pri build-u); prazan = kontakt mejl. */
export const CHECKOUT_URL =
  (import.meta.env.VITE_CHECKOUT_URL as string | undefined) ?? "";
export const CONTACT_EMAIL = "office@aichatbot.rs";

// Aktivacioni kodovi (šalju se korisniku posle uplate)
const PROMO_CODES = ["SAFENEST-OSNIVAC", "SAFENEST-PRO-2026"];

export interface SubStatus {
  state: "trial" | "expired" | "subscribed";
  daysLeft: number;
}

export function getStatus(): SubStatus {
  try {
    if (localStorage.getItem(SUB_KEY) === "1") {
      return { state: "subscribed", daysLeft: 0 };
    }
    let start = localStorage.getItem(TRIAL_KEY);
    if (!start) {
      start = new Date().toISOString();
      localStorage.setItem(TRIAL_KEY, start);
    }
    const elapsedDays = (Date.now() - new Date(start).getTime()) / 86_400_000;
    const daysLeft = Math.ceil(TRIAL_DAYS - elapsedDays);
    return daysLeft > 0
      ? { state: "trial", daysLeft }
      : { state: "expired", daysLeft: 0 };
  } catch {
    // Bez localStorage (privatni mod) ne zaključavamo aplikaciju
    return { state: "trial", daysLeft: TRIAL_DAYS };
  }
}

/** Unos aktivacionog koda posle uplate. */
export function redeemCode(code: string): boolean {
  const ok = PROMO_CODES.includes(code.trim().toUpperCase());
  if (ok) {
    try {
      localStorage.setItem(SUB_KEY, "1");
    } catch {
      /* ignoriši */
    }
  }
  return ok;
}
