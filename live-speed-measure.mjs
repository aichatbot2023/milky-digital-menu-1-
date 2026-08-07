/**
 * Koliko traje JEDAN prolaz detekcije — i koliko se nalazi razlikuju
 * od prolaza do prolaza na ISTOJ, nepokretnoj slici.
 *
 * Drugi deo je važniji od prvog: ako model na istoj slici dva puta zaredom
 * vrati različit spisak, nikakvo ubrzanje neće smiriti ekran. Treperenje
 * tada nije stvar crtanja nego nestabilnosti samog nalaza.
 */
import { chromium } from "playwright-core";

const B = process.env.BASE ?? "http://127.0.0.1:5199";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("err:", m.text().slice(0, 140)); });
await page.goto(`${B}/app/`, { waitUntil: "domcontentloaded" });

const res = await page.evaluate(async () => {
  const { detectLocal } = await import("/src/lib/detector.ts");
  // Ista slika svaki put: nasumičan šum bi merio šum, a mi merimo stabilnost.
  const c = document.createElement("canvas");
  c.width = 640; c.height = 480;
  const g = c.getContext("2d");
  g.fillStyle = "#d8d2c8"; g.fillRect(0, 0, 640, 480);
  g.fillStyle = "#3b3b40"; g.fillRect(60, 300, 220, 150);   // tamna masa (sto)
  g.fillStyle = "#b04a2a"; g.beginPath(); g.arc(400, 250, 55, 0, 7); g.fill();
  g.fillStyle = "#eeeeee"; g.fillRect(470, 320, 90, 120);
  g.fillStyle = "#222"; g.fillRect(120, 90, 300, 160);

  const t0 = performance.now();
  await detectLocal(c, 640, 480, "1-2y", { quadrant: 0 });  // zagrevanje
  const warm = performance.now() - t0;

  const runs = [];
  for (let i = 0; i < 8; i++) {
    const a = performance.now();
    const hz = await detectLocal(c, 640, 480, "1-2y", { quadrant: i % 4 });
    runs.push({
      ms: Math.round(performance.now() - a),
      labels: hz.map((h) => h.label).sort(),
    });
  }
  // Koliko traje PUNI foto prolaz (6 prolaza modela) — to je „Slikaj" put.
  const b = performance.now();
  await detectLocal(c, 640, 480, "1-2y", { detail: "photo" });
  const photo = Math.round(performance.now() - b);
  return { warm: Math.round(warm), runs, photo };
});

console.log(`prvi (hladan) prolaz: ${res.warm} ms`);
const ms = res.runs.map((r) => r.ms);
console.log(`uživo prolaz: ${Math.min(...ms)}–${Math.max(...ms)} ms, ` +
  `srednje ${Math.round(ms.reduce((a, b) => a + b) / ms.length)} ms`);
console.log(`pun foto prolaz: ${res.photo} ms`);
console.log("\nnalaz po prolazu (ista slika svaki put):");
res.runs.forEach((r, i) => console.log(`  ${i}: ${r.labels.join(", ") || "—"}`));
const uniq = new Set(res.runs.map((r) => r.labels.join("|")));
console.log(`\nrazličitih spiskova na istoj slici: ${uniq.size} od ${res.runs.length}`);
await browser.close();
