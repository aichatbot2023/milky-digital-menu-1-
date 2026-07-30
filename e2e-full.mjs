import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

// Sandbox: Chromium ne moze kroz MITM proxy — Supabase pozive testa
// prosledjujemo kroz curl (isti zahtevi, prava produkcija)
async function routeViaCurl(route) {
  const req = route.request();
  if (req.method() === "OPTIONS") {
    return route.fulfill({ status: 200, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, GET, OPTIONS" } });
  }
  const args = ["-sS", "-X", req.method(), req.url(), "-o", "-", "-w", "\n%{http_code}", "--max-time", "60"];
  for (const [k, v] of Object.entries(req.headers())) {
    if (!k.startsWith(":") && !["host", "content-length", "accept-encoding"].includes(k)) args.push("-H", `${k}: ${v}`);
  }
  const body = req.postData();
  if (body) args.push("--data-binary", body);
  try {
    const out = execFileSync("curl", args, { encoding: "utf8", timeout: 70000 });
    const i = out.lastIndexOf("\n");
    await route.fulfill({ status: parseInt(out.slice(i + 1), 10) || 200,
      headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
      body: out.slice(0, i) });
  } catch { await route.abort(); }
}

const B = "http://localhost:5199";
const results = [];
const ok = (name, pass, note = "") => { results.push({ name, pass, note }); console.log(pass ? "✅" : "❌", name, note); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 400, height: 850 } });
await ctx.route("https://equjrxwpxrkchicetyvs.supabase.co/**", routeViaCurl);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));

// 1. LANDING
await page.goto(B + "/", { waitUntil: "domcontentloaded" });
ok("Landing se učitava", (await page.title()).includes("SafeNest"));
ok("Landing: hero CTA", await page.locator("#installBtn").count() > 0);
ok("Landing: Amazon izjava u footeru", (await page.locator(".copyright").innerText()).includes("Amazon Associate"));
ok("Landing: AiChatBot widget skripta", await page.locator('script[src*="aichatbot.rs"]').count() > 0);

// 2. APP: jezik → onboarding → registracija → home
await page.goto(B + "/app/", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".lang-item", { timeout: 20000 });
ok("Birač jezika se prikazuje", true);
await page.locator(".lang-item", { hasText: "Srpski" }).first().click();
await page.waitForTimeout(400);
// Onboarding — preskoči
const skip = page.locator("button", { hasText: "Preskoči" });
if (await skip.count()) { await skip.first().click(); ok("Onboarding: preskočen", true); }
else ok("Onboarding: preskočen", false, "dugme nije nađeno");
// Registracija OBAVEZNA
await page.waitForSelector(".register-card", { timeout: 10000 }).catch(() => {});
ok("Registracija je OBAVEZNA (gate)", await page.locator(".register-card").count() > 0);
const regBtn = page.locator(".register-card button.btn-primary");
ok("Registracija: dugme disabled bez emaila", await regBtn.isDisabled());
await page.fill('.register-card input[type="text"]', "E2E Test");
await page.fill('.register-card input[type="email"]', "e2e-test@safenest.test");
await regBtn.click();
await page.waitForTimeout(1500);
ok("Posle registracije → početni ekran", await page.locator(".subbar").count() > 0);
const subbarText = await page.locator(".subbar").innerText().catch(() => "");
ok("Trial traka: 7 dana", subbarText.includes("7"), subbarText.slice(0, 60));

// 3. PAYWALL: klik na traku → novi Stripe link
await page.locator(".subbar").click();
await page.waitForSelector(".paywall", { timeout: 5000 });
ok("Paywall se otvara", true);
ok("Paywall: cena 7 €", (await page.locator(".paywall").innerText()).includes("7"));
await page.locator(".paywall .btn-ghost").click();

// 4. KATALOG PROIZVODA (marketplace) — iz konteksta stranice
const cat = await page.evaluate(async () => {
  const r = await fetch("https://equjrxwpxrkchicetyvs.supabase.co/functions/v1/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json",
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxdWpyeHdweHJrY2hpY2V0eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4OTgxNjYsImV4cCI6MjA2NTQ3NDE2Nn0.xU8in9GwHQK5tYXuN4yZG4f9aVXPjy4GhbbmlnHuBo8" },
    body: JSON.stringify({ action: "products" }),
  });
  return (await r.json()).products?.length ?? 0;
});
ok("Marketplace katalog dostupan iz aplikacije", cat >= 8, `${cat} proizvoda`);

// 5. GIFT nalog: registracija poklonjenim emailom → Premium
const ctx2 = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 400, height: 850 } });
await ctx2.route("https://equjrxwpxrkchicetyvs.supabase.co/**", routeViaCurl);
const p2 = await ctx2.newPage();
await p2.goto(B + "/app/", { waitUntil: "domcontentloaded" });
await p2.waitForSelector(".lang-item", { timeout: 20000 });
await p2.locator(".lang-item", { hasText: "Srpski" }).first().click();
await p2.waitForTimeout(400);
const skip2 = p2.locator("button", { hasText: "Preskoči" });
if (await skip2.count()) await skip2.first().click();
await p2.waitForSelector(".register-card", { timeout: 10000 });
await p2.fill('.register-card input[type="email"]', "office@aichatbot.rs");
await p2.locator(".register-card button.btn-primary").click();
await p2.waitForTimeout(2500);
const sub2 = await p2.locator(".subbar").innerText().catch(() => "");
ok("Gift email → Premium automatski", /premium/i.test(sub2), sub2.slice(0, 60));
await ctx2.close();

// 6. YOLO model fajlovi dostupni
const yolo = await page.evaluate(async () => (await fetch("/model/yolo/model.json")).status);
ok("YOLO model se služi sa sajta", yolo === 200);

// 7. ADMIN panel
const key = process.env.ADMIN_KEY ?? "";
await page.goto(B + "/admin.html", { waitUntil: "domcontentloaded" });
await page.fill("#key", key);
await page.click("text=Prijavi se / Osveži");
await page.waitForSelector("#panel", { state: "visible", timeout: 15000 });
ok("Admin: prijava ključem", true);
for (const [sel, name] of [["#dtable", "Aktivnost po danima"], ["#scantot", "Šta se skenira"], ["#ltable", "Lokacije"], ["#gtable", "Pokloni"], ["#prtable", "Marketplace"], ["#utable", "Korisnici"], ["#ptable", "Partneri"]]) {
  ok("Admin sekcija: " + name, await page.locator(sel).count() > 0);
}
const gifts = await page.locator("#gtable tbody tr").count();
ok("Admin: gift lista ima unos", gifts >= 1, `${gifts} poklona`);
const users = await page.locator("#utable tbody tr").count();
ok("Admin: registrovani korisnici sa emailom", users >= 1, `${users} korisnika`);

ok("Bez JS grešaka na stranicama", errors.length === 0, errors.join(" | ").slice(0, 200));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${results.length - failed.length}/${results.length} prošlo ===`);
process.exit(failed.length ? 1 : 0);
