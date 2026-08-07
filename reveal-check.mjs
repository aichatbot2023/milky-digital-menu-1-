/**
 * Da li roditelj ZAISTA vidi svoju sobu sa svim nalazima.
 *
 * Ubacuje gotov sken u memoriju aplikacije i otvara nalaz, pa gleda šta se
 * pojavi na ekranu: da li iskaču okviri, da li brojač raste do punog broja,
 * i da li se posle svega nudi prelazak na spisak.
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const B = process.env.BASE ?? "http://127.0.0.1:5199";
const PHOTO = process.env.PHOTO ??
  "/tmp/claude-0/-home-user-milky-digital-menu-1-/2ec40fd1-9afc-5e56-9223-9a405f8f8044/scratchpad/k1024.jpg";
const dataUrl = "data:image/jpeg;base64," + readFileSync(PHOTO).toString("base64");

const HZ = [
  ["Ringle šporeta", "burn", "critical", 0.36, 0.44, 0.2, 0.12],
  ["Vreo lonac", "burn", "critical", 0.42, 0.34, 0.12, 0.11],
  ["Utičnica", "electric", "high", 0.72, 0.46, 0.07, 0.05],
  ["Fioke kuhinje", "crush", "medium", 0.15, 0.6, 0.22, 0.18],
  ["Sredstvo za čišćenje", "poisoning", "critical", 0.58, 0.68, 0.1, 0.14],
  ["Staklene tegle", "cutting", "medium", 0.2, 0.2, 0.12, 0.1],
  ["Oštra ivica radne ploče", "other", "low", 0.1, 0.52, 0.5, 0.04],
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
// Oblak se glumi: vraća se gotov nalaz, pa se meri EKRAN a ne model.
const katalog = JSON.parse(readFileSync(
  "/tmp/claude-0/-home-user-milky-digital-menu-1-/2ec40fd1-9afc-5e56-9223-9a405f8f8044/scratchpad/katalog.json", "utf8"));
await ctx.route("https://equjrxwpxrkchicetyvs.supabase.co/**", async (r) => {
  const u = r.request().url();
  if (u.includes("/partners")) {
    return r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*",
      "content-type": "application/json" }, body: JSON.stringify(katalog) });
  }
  if (u.includes("safenest-products")) {
    return r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*",
      "content-type": "image/webp" }, body: readFileSync("public/products/socket-cover.webp") });
  }
  if (!u.includes("analyze-hazards")) return r.abort();
  const hazards = HZ.map(([label, category, severity, x, y, w, h]) => ({
    label, category, severity, box: { x, y, w, h },
    why: "Objašnjenje zašto je opasno za dete ovog uzrasta.",
    stats: "Izvor: WHO.", fix: "Ukloniti van domašaja.",
    facts: ["Nadohvat detetu"], steps: ["Skloni odmah"], reach: 9, solution: "",
  }));
  await r.fulfill({
    status: 200,
    headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
    body: JSON.stringify({ hazards, safety_score: 34, summary: "Nađeno je više opasnosti." }),
  });
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("greška:", String(e).slice(0, 200)));

await page.addInitScript(([url, hz]) => {
  localStorage.setItem("safenest.lang", "sr");
  localStorage.setItem("safenest.onboarded", "1");
  localStorage.setItem("safenest.user", JSON.stringify({
    name: "Test", email: "proba@example.com",
    startedAt: new Date().toISOString(), plan: "trial",
  }));
  localStorage.setItem("safenest.children",
    JSON.stringify([{ id: "c1", name: "Mika", age: "1-2y" }]));
  const hazards = hz.map(([label, category, severity, x, y, w, h], i) => ({
    id: "h" + i, label, category, severity, box: { x, y, w, h },
    why: "Objašnjenje zašto je opasno za dete ovog uzrasta.",
    stats: "Izvor: WHO.", fix: "Ukloniti van domašaja.",
    facts: ["Nadohvat detetu"], steps: ["Skloni odmah"],
  }));
  void url; void hazards;
}, [dataUrl, HZ]);

// Birač fajlova se popunjava spolja — aplikacija ostaje netaknuta, bez
// ijedne kuke koja postoji samo zbog testa.
page.on("filechooser", (fc) => fc.setFiles(PHOTO).catch(() => {}));

await page.goto(`${B}/app/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Zid registracije ostaje kakav jeste — samo se prođe kroz njega.
if (await page.locator("input").count()) {
  await page.locator("input").first().fill("Test Roditelj");
  const e = page.locator("input").nth(1);
  if (await e.count()) await e.fill("proba@example.com");
  const go = page.locator("button").filter({ hasText: /Započni|Nastavi|Kreni/i }).first();
  if (await go.count()) { await go.click(); await page.waitForTimeout(2500); }
}

// Pokreni pravo skeniranje fotografije.
await page.locator("button").filter({ hasText: /Skeniraj fotografiju|Slikaj/i }).first()
  .click().catch(() => {});
await page.waitForTimeout(1200);
// Bez kamere aplikacija nudi biranje slike — dugme nosi ikonicu, ne tekst.
const pick = page.locator("button").filter({ hasText: /🖼️|Galerij|Izaberi/i }).first();
if (await pick.count()) await pick.click();
else await page.locator("button").last().click();
await page.waitForSelector(".reveal", { timeout: 30000 }).catch(() => {});

if (!(await page.locator(".reveal").count())) {
  console.log("otkrivanje se NIJE pojavilo. Ekran:");
  console.log((await page.locator("body").innerText()).slice(0, 500));
  await page.screenshot({ path: "reveal-nema.png" });
  await browser.close();
  process.exit(1);
}

// Prati kako nalazi iskaču.
const frames = [];
for (let i = 0; i < 40; i++) {
  frames.push(await page.evaluate(() => ({
    boxes: document.querySelectorAll(".reveal-box").length,
    count: document.querySelector(".reveal-count b")?.textContent ?? "",
    go: !!document.querySelector(".reveal-go"),
  })));
  if (frames.at(-1).go) break;
  await page.waitForTimeout(200);
}
await page.screenshot({ path: "reveal-1-soba.png" });

const seq = frames.map((f) => f.boxes);
console.log(`okviri iskaču: ${seq.join(" → ")}`);
console.log(`ukupno nalaza na slici: ${Math.max(...seq)} (očekivano ${HZ.length})`);
console.log(`brojač: ${frames.at(-1).count}`);
console.log(`ponuđen prelazak na spisak: ${frames.at(-1).go ? "da" : "NE"}`);
console.log(`legenda po težini: ${await page.locator(".reveal-chip").allInnerTexts()
  .then((x) => x.join(" · "))}`);

// Nastavi na spisak i proveri da se otkrivanje NE ponavlja.
await page.locator(".reveal-go").click();
await page.waitForTimeout(900);
await page.screenshot({ path: "reveal-2-fokus.png" });
console.log(`posle nastavka, otkrivanje se vidi: ${await page.locator(".reveal").count() > 0 ? "DA (greška)" : "ne"}`);
console.log(`oznaka Amazon partnera na strani: ${await page.locator(".amzn").count()}`);

// Šta roditelj vidi na kartici prve opasnosti.
await page.waitForTimeout(3500);
console.log(`\n=== kartica prve opasnosti ===`);
console.log(`3D prikaz „na svom mestu": ${await page.locator(".ip").count() > 0 ? "VIDI SE" : "NE VIDI SE"}`);
console.log(`preporuka proizvoda: ${await page.locator(".alt-item").count()}`);
const thumbs = await page.locator(".alt-thumb img").count();
console.log(`sličica proizvoda: ${thumbs}`);
if (thumbs) {
  const bb = await page.locator(".alt-thumb").first().boundingBox();
  console.log(`veličina sličice: ${Math.round(bb.width)}×${Math.round(bb.height)} px`);
}
await page.screenshot({ path: "kartica.png", fullPage: true });

await browser.close();
