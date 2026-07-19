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

/** Stripe Payment Link — 7 €/mes, prvih 7 dana besplatno. */
export const CHECKOUT_URL =
  (import.meta.env.VITE_CHECKOUT_URL as string | undefined) ??
  "https://buy.stripe.com/dRmfZg7ae6AIeEU8zY7AI0f";
export const CONTACT_EMAIL = "office@aichatbot.rs";

const VERIFY_URL =
  (import.meta.env.VITE_VERIFY_FUNCTION_URL as string | undefined) ??
  "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/verify-subscription";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

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

/**
 * AUTOMATSKI pristup posle uplate: Stripe posle checkout-a vraća korisnika
 * na sajt sa ?session_id=cs_...; ovde ga serverski verifikujemo kod
 * Stripe-a i tek onda otključavamo Premium.
 */
export async function verifyCheckoutSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON}`,
        "apikey": ANON,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.active) {
      try {
        localStorage.setItem(SUB_KEY, "1");
        if (data.subscription) {
          localStorage.setItem("safenest.stripeSubId", String(data.subscription));
        }
      } catch {
        /* ignoriši */
      }
      return true;
    }
    return false;
  } catch {
    return false;
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
