/**
 * Brend marketplace: partnerski proizvodi koji rešavaju uočene opasnosti
 * (štitnici za uglove, poklopci za utičnice, sigurnosne kapije...).
 * Katalogom upravlja vlasnik u /admin.html; kupovina ide preko affiliate
 * linka partnera, a svaki klik se beleži za obračun provizije.
 */
import { isSr } from "./i18n";
import { getRef, track } from "./subscription";

export interface PartnerProduct {
  id: number;
  category: string;
  brand: string;
  title: string;
  title_en: string | null;
  url: string;
  price: string | null;
}

const PRODUCTS_URL =
  "https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/partners";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8";

const RECS_KEY = "safenest.recsOff"; // podrazumevano UKLJUČENO

export function recsEnabled(): boolean {
  try {
    return localStorage.getItem(RECS_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setRecsEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(RECS_KEY);
    else localStorage.setItem(RECS_KEY, "1");
  } catch {
    /* ignoriši */
  }
}

// Keš kataloga za sesiju (jedan mrežni poziv po otvaranju aplikacije)
let catalog: PartnerProduct[] | null = null;
let catalogPromise: Promise<PartnerProduct[]> | null = null;

export function fetchCatalog(): Promise<PartnerProduct[]> {
  if (catalog) return Promise.resolve(catalog);
  if (!catalogPromise) {
    catalogPromise = fetch(PRODUCTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON}`,
        "apikey": ANON,
      },
      body: JSON.stringify({ action: "products" }),
    })
      .then((r) => r.json())
      .then((d) => {
        catalog = Array.isArray(d.products) ? d.products : [];
        return catalog!;
      })
      .catch(() => {
        catalogPromise = null;
        return [];
      });
  }
  return catalogPromise;
}

/** Proizvodi za datu kategoriju opasnosti (max 3, da ne guše sadržaj). */
export async function productsForCategory(category: string): Promise<PartnerProduct[]> {
  if (!recsEnabled()) return [];
  const all = await fetchCatalog();
  return all.filter((p) => p.category === category).slice(0, 3);
}

/** Lokalizovan naziv proizvoda (sr default, en za ostale jezike). */
export function productTitle(p: PartnerProduct): string {
  return isSr() ? p.title : (p.title_en ?? p.title);
}

/**
 * Amazon Associates (UK) tag — kada stigne odobren tag (npr. "safenest-21"),
 * upisati ga ovde: automatski se dodaje na SVAKI amazon.* link u katalogu
 * koji ga već nema, pa linkovi u bazi ne moraju da se prepravljaju.
 */
const AMAZON_TAG = "";

function withAffiliateTag(url: string): string {
  if (!AMAZON_TAG) return url;
  try {
    const u = new URL(url);
    if (/(^|\.)amazon\./.test(u.hostname) && !u.searchParams.has("tag")) {
      u.searchParams.set("tag", AMAZON_TAG);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Otvori affiliate link partnera + zabeleži klik (obračun provizije). */
export function openProduct(p: PartnerProduct) {
  track("click", getRef(), { product_id: String(p.id), brand: p.brand });
  window.open(withAffiliateTag(p.url), "_blank", "noopener");
}
