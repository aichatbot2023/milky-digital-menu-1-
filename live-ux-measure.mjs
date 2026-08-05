/**
 * Merenje onoga što oko roditelja zaista vidi tokom „uživo" skeniranja.
 *
 * Kamera je NEPOKRETNA (isti kadar 30 puta u sekundi). Zato je merenje
 * strogo: sve što se na ekranu pomeri, pojavi ili nestane je greška
 * aplikacije, a ne posledica drhtanja ruke. Ako na mirnoj slici okviri
 * skaču — na telefonu u ruci je višestruko gore.
 *
 * Meri se, na svakih 120 ms:
 *   - koliko okvira stoji na ekranu
 *   - gde stoji svaki od njih (da se vidi skakanje)
 *   - koji tekst piše na donjoj kartici (da se vidi zamena teksta pod prstom)
 *   - koliko puta se DOM čvor okvira zameni novim (treperenje)
 */
import { chromium } from "playwright-core";

const B = process.env.BASE ?? "http://127.0.0.1:5199";
const FEED = process.env.FEED ??
  "/tmp/claude-0/-home-user-milky-digital-menu-1-/2ec40fd1-9afc-5e56-9223-9a405f8f8044/scratchpad/kamera.y4m";
const SECONDS = Number(process.env.SECONDS ?? 24);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${FEED}`],
});
const ctx = await browser.newContext({
  viewport: { width: 420, height: 900 }, permissions: ["camera"],
});
// Oblak je namerno ISKLJUČEN: meri se lokalna petlja, koja radi non-stop.
await ctx.route("https://equjrxwpxrkchicetyvs.supabase.co/**", (r) => r.abort());
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("greška:", String(e).slice(0, 160)));

// Preskoči uvod i registraciju — nas zanima samo ekran skeniranja.
await page.addInitScript(() => {
  localStorage.setItem("safenest.lang", "sr");
  localStorage.setItem("safenest.onboarded", "1");
  localStorage.setItem("safenest.intro", "done");
  localStorage.setItem("safenest.user", JSON.stringify({
    name: "Test", email: "proba@example.com",
    startedAt: new Date().toISOString(), plan: "trial",
  }));
  localStorage.setItem("safenest.children", JSON.stringify([
    { id: "c1", name: "Mika", age: "1-2y" },
  ]));
});

await page.goto(`${B}/app/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Ako je jezik ipak pitan, odgovori.
const sr = page.getByText("Srpski", { exact: false }).first();
if (await sr.count()) { await sr.click(); await page.waitForTimeout(1200); }
for (let i = 0; i < 6; i++) {
  const b = page.locator("button").filter({
    hasText: /^\s*(Dalje|Nastavi|Kreni|Razumem|U redu|Počni zaštitu|Preskoči)\s*$/i }).first();
  if (!(await b.count()) || !(await b.isEnabled())) break;
  await b.click(); await page.waitForTimeout(700);
}
if (await page.locator("input").count()) {
  await page.locator("input").first().fill("Test Roditelj");
  const e = page.locator('input[type=email], input').nth(1);
  if (await e.count()) await e.fill("proba@example.com");
  const zap = page.locator("button").filter({ hasText: /Započni|Nastavi|Kreni/i }).first();
  if (await zap.count()) { await zap.click(); await page.waitForTimeout(2500); }
}

const live = page.locator("button").filter({ hasText: /Uživo/i }).first();
if (!(await live.count())) {
  console.log("nije nađeno dugme za uživo skeniranje; tekst ekrana:");
  console.log((await page.locator("body").innerText()).slice(0, 600));
  await page.screenshot({ path: "ux-nema-dugme.png" });
  await browser.close();
  process.exit(1);
}
await live.click();
await page.waitForSelector(".live-wrap", { timeout: 20000 });
console.log("ušao u uživo skeniranje; čekam da se model učita…");

// Uzorkovanje kreće tek kad model proradi (da se ne meri učitavanje).
await page.waitForFunction(
  () => !/Učitavam/.test(document.querySelector(".live-status")?.textContent ?? ""),
  { timeout: 90000 }).catch(() => console.log("model se nije učitao u roku"));

const samples = await page.evaluate(async (seconds) => {
  const out = [];
  // Svakom okviru se dodeli oznaka na prvi susret. Ako ista kutija sledeći
  // put dobije NOVU oznaku, znači da je React uništio čvor i napravio drugi
  // — to je treperenje koje se na ekranu vidi kao bljesak.
  let nodeSeq = 0;
  const seen = new WeakMap();
  const t0 = performance.now();
  while (performance.now() - t0 < seconds * 1000) {
    const spot = document.querySelector(".live-box");
    const ss = spot?.style;
    const boxes = [...document.querySelectorAll(".live-box")].map((el) => {
      if (!seen.has(el)) seen.set(el, ++nodeSeq);
      const s = el.style;
      return {
        node: seen.get(el),
        label: (el.getAttribute("aria-label") || "").trim(),
        x: Math.round(parseFloat(s.left)), y: Math.round(parseFloat(s.top)),
        w: Math.round(parseFloat(s.width)), h: Math.round(parseFloat(s.height)),
      };
    });
    out.push({
      t: Math.round(performance.now() - t0),
      status: (document.querySelector(".live-status")?.textContent ?? "").trim(),
      phase: document.querySelector(".live-wrap")?.getAttribute("data-phase") ?? "",
      card: (document.querySelector(".live-strip-body strong")?.textContent ?? "").trim(),
      why: (document.querySelector(".live-strip-why")?.textContent ?? "").trim().slice(0, 40),
      // Reflektor kao takav — bez obzira šta u njemu piše. Ovo je ono što
      // oko prati: pravougaonik svetla na ekranu.
      spot: ss ? `${Math.round(parseFloat(ss.left))},${Math.round(parseFloat(ss.top))},` +
        `${Math.round(parseFloat(ss.width))},${Math.round(parseFloat(ss.height))}` : "",
      boxes,
    });
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}, SECONDS);

await page.screenshot({ path: "ux-uzivo.png" });
await browser.close();

// ---- izveštaj -------------------------------------------------------------
const change = (arr) => arr.reduce((n, v, i) => n + (i > 0 && v !== arr[i - 1] ? 1 : 0), 0);
const cards = samples.map((s) => s.card);
const counts = samples.map((s) => s.boxes.length);

console.log(`\n=== ${SECONDS}s, snimak ${FEED.split("/").pop()}, ${samples.length} uzoraka ===`);
console.log(`broj okvira na ekranu: min ${Math.min(...counts)}, max ${Math.max(...counts)}, ` +
  `menjao se ${change(counts)} puta`);
console.log(`tekst donje kartice se promenio ${change(cards)} puta`);
console.log(`  redosled kartica: ${[...new Set(cards.filter(Boolean))].join(" → ").slice(0, 300)}`);

// Koliko je puta isti naziv dobio nov DOM čvor = koliko je puta bljesnuo.
const lastNode = new Map();
let remount = 0, jump = 0, jumpMax = 0;
const lastPos = new Map();
for (const s of samples) {
  for (const b of s.boxes) {
    if (lastNode.has(b.label) && lastNode.get(b.label) !== b.node) remount++;
    lastNode.set(b.label, b.node);
    const p = lastPos.get(b.label);
    if (p) {
      const d = Math.abs(p.x - b.x) + Math.abs(p.y - b.y) + Math.abs(p.w - b.w) + Math.abs(p.h - b.h);
      if (d > 1) { jump++; jumpMax = Math.max(jumpMax, d); }
    }
    lastPos.set(b.label, b);
  }
}
console.log(`okvir zamenjen novim DOM čvorom (bljesak): ${remount} puta`);
console.log(`okvir skočio na novo mesto: ${jump} puta, najveći skok ${jumpMax}% ekrana`);

// Koliko različitih naziva se ikad pojavilo — na istoj slici bi trebalo malo.
const labels = new Map();
for (const s of samples) for (const b of s.boxes) labels.set(b.label, (labels.get(b.label) ?? 0) + 1);
console.log(`\nrazličitih naziva viđeno: ${labels.size}`);
for (const [l, n] of [...labels].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`   ${String(Math.round((n / samples.length) * 100)).padStart(3)}% vremena  ${l}`);
}
// Reflektor: koliko puta je pravougaonik svetla odskočio na drugo mesto.
const spots = samples.map((s) => s.spot).filter(Boolean);
let hops = 0, hopMax = 0;
for (let i = 1; i < spots.length; i++) {
  if (spots[i] === spots[i - 1]) continue;
  const a = spots[i - 1].split(",").map(Number), b = spots[i].split(",").map(Number);
  const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  hops++; hopMax = Math.max(hopMax, d);
}
console.log(`reflektor odskočio na drugo mesto: ${hops} puta u ${SECONDS}s ` +
  `(najdalje ${hopMax}% ekrana)`);

const ph = samples.map((s) => s.phase);
const phTime = {};
for (const x of ph) phTime[x] = (phTime[x] ?? 0) + 1;
console.log("\nstanje petlje: " + Object.entries(phTime)
  .map(([k, n]) => `${k} ${Math.round((n / ph.length) * 100)}%`).join(", "));
console.log(`prolaza modela (ulazaka u „gledam"): ${change(ph.map((x) => x === "looking" || x === "closer"))/2|0}`);
const first = samples.findIndex((s) => s.boxes.length > 0);
console.log(`prvi nalaz na ekranu: ${first < 0 ? "nikad" : samples[first].t + " ms"}`);
console.log(`\nstatus traka: ${[...new Set(samples.map((s) => s.status))].slice(0, 8).join(" | ")}`);
