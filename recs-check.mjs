/** Šta se stvarno preporuči za svaku opasnost — i da li nosi sliku. */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const c = await b.newContext();
// Katalog se podmeće PRAVIM podacima: pregledač u ovom okruženju ne može do
// mreže, pa bi bez ovoga merili prazan katalog i doneli pogrešan zaključak.
const katalog = JSON.parse(readFileSync(
  "/tmp/claude-0/-home-user-milky-digital-menu-1-/2ec40fd1-9afc-5e56-9223-9a405f8f8044/scratchpad/katalog.json", "utf8"));
await c.route("https://equjrxwpxrkchicetyvs.supabase.co/**", (r) =>
  r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*",
    "content-type": "application/json" }, body: JSON.stringify(katalog) }));
const p = await c.newPage();
await p.addInitScript(() => localStorage.setItem("safenest.lang", "sr"));
await p.goto("http://127.0.0.1:5199/app/", { waitUntil: "domcontentloaded" });
const HZ = [
  ["Ringle šporeta", "burn", "hob_guard", "stove"],
  ["Vreo lonac", "burn", "", "bowl"],
  ["Utičnica", "electric", "socket_cover", "socket"],
  ["Fioke kuhinje", "crush", "drawer_lock", "drawer"],
  ["Stepenice", "fall", "stair_gate", "stairs"],
  ["Plastična kesa", "choking", "small_parts_bin", "plastic_bag"],
  ["Gajtan roletne", "strangulation", "blind_cord_winder", "blind"],
  ["Kada", "drowning", "bath_mat", "bathtub"],
  ["Sredstvo za čišćenje", "poisoning", "chemical_lock", "bottle"],
  ["Oštra ivica radne ploče", "other", "corner_guard", ""],
];
const r = await p.evaluate(async (HZ) => {
  const { recommendationsFor } = await import("/src/lib/products.ts");
  const out = [];
  for (const [label, category, solution, sourceClass] of HZ) {
    const recs = await recommendationsFor({ label, category, solution, sourceClass });
    out.push({ label, recs: recs.map((x) => ({ t: x.title.slice(0, 42), s: x.isSearch, img: !!x.image })) });
  }
  return out;
}, HZ);
for (const x of r) {
  console.log(`\n${x.label}`);
  for (const rr of x.recs) console.log(`   ${rr.s ? "🔍 pretraga" : rr.img ? "🖼️ proizvod " : "▫️ proizvod "} ${rr.t}`);
}
const first = r.map((x) => x.recs[0]);
console.log(`\nprvi je proizvod SA SLIKOM (uslov za 3D prikaz): ${first.filter((f) => f && !f.s && f.img).length}/${r.length}`);
await b.close();
