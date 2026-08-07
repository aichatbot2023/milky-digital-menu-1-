/**
 * Provera pratioca predmeta na izmišljenim nalazima.
 *
 * Merenje u aplikaciji pokazuje da je ekran miran, ali ne pokazuje ZAŠTO i
 * ne pokriva slučajeve koji se u sobi ne dese na komandu: predmet koji
 * izađe iz kadra, model koji jedan prolaz promaši, dva predmeta jedan uz
 * drugi. Ovde se ti slučajevi postavljaju namerno.
 */
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5199/app/", { waitUntil: "domcontentloaded" });

const out = await page.evaluate(async () => {
  const { HazardTracker } = await import("/src/lib/tracker.ts");
  const log = [];
  const ok = (name, cond, extra = "") =>
    log.push(`${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);

  const hz = (o) => ({
    id: "x", label: o.label ?? "Činija", category: o.category ?? "other",
    severity: o.severity ?? "medium", box: o.box, why: "", stats: "", fix: "",
    sourceClass: o.src ?? "bowl", confidence: o.conf ?? 0.9,
    uncertain: o.uncertain ?? false,
  });
  const B = (x, y) => ({ x, y, w: 0.2, h: 0.2 });

  // 1. Isti predmet koji se malo pomera zadržava ISTI identitet.
  {
    const tr = new HazardTracker();
    const a = tr.update([hz({ box: B(0.3, 0.3) })], 1000);
    const b = tr.update([hz({ box: B(0.32, 0.31) })], 2000);
    const c = tr.update([hz({ box: B(0.34, 0.32) })], 3000);
    ok("predmet u pokretu ostaje isti nalaz",
      a[0]?.id === b[0]?.id && b[0]?.id === c[0]?.id,
      `${a[0]?.id}/${b[0]?.id}/${c[0]?.id}`);
    ok("i dalje je jedan, a ne tri", c.length === 1, `${c.length}`);
  }

  // 2. Ono zbog čega je sve i počelo: „Činija" i „Moguće: Činija" su
  //    JEDNA činija, a ne dve opasnosti. Sigurno ime pobeđuje.
  {
    const tr = new HazardTracker();
    tr.update([hz({ box: B(0.3, 0.3), conf: 0.4, uncertain: true })], 1000);
    const r = tr.update([hz({ box: B(0.31, 0.3), conf: 0.9 })], 2000);
    ok("nesigurno i sigurno viđenje su isti predmet", r.length === 1, `${r.length}`);
    ok("pobeđuje sigurno ime", r[0]?.uncertain === false);
  }

  // 3. Jedan promašen prolaz ne briše predmet sa ekrana (ne treperi),
  //    ali nekoliko uzastopnih ga briše (ne ostaje duh).
  {
    const tr = new HazardTracker();
    tr.update([hz({ box: B(0.3, 0.3) })], 1000);
    tr.update([hz({ box: B(0.3, 0.3) })], 2000);
    ok("preživi jedan promašaj", tr.update([], 3000).length === 1);
    ok("preživi i drugi", tr.update([], 4000).length === 1);
    ok("posle trećeg nestaje", tr.update([], 5000).length === 0);
  }

  // 4. Nagađanje mora da se ponovi da bi se uopšte prikazalo.
  {
    const tr = new HazardTracker();
    const first = tr.update([hz({ box: B(0.3, 0.3), conf: 0.3, uncertain: true })], 1000);
    ok("slab nalaz se ne prikazuje odmah", first.length === 0, `${first.length}`);
    const second = tr.update([hz({ box: B(0.3, 0.3), conf: 0.3, uncertain: true })], 2000);
    ok("prikazuje se kad se potvrdi", second.length === 1, `${second.length}`);
  }

  // 5. Ozbiljna opasnost se NE odlaže. Nož ne sme da čeka drugi prolaz.
  {
    const tr = new HazardTracker();
    const r = tr.update([hz({
      box: B(0.3, 0.3), severity: "critical", src: "knife",
      label: "Nož", category: "cutting", conf: 0.3, uncertain: true,
    })], 1000);
    ok("kritična opasnost se vidi iz prvog prolaza", r.length === 1, `${r.length}`);
  }

  // 6. Dva različita predmeta jedan pored drugog ostaju dva.
  {
    const tr = new HazardTracker();
    const r = tr.update([
      hz({ box: B(0.1, 0.1) }),
      hz({ box: B(0.7, 0.7), src: "oven", label: "Šporet", category: "burn" }),
    ], 1000);
    ok("dva odvojena predmeta se ne spajaju", r.length === 2, `${r.length}`);
    ok("i imaju različite identitete", r[0].id !== r[1].id);
  }

  // 7. Okvir KLIZI ka novom mestu umesto da skoči na njega.
  {
    const tr = new HazardTracker();
    tr.update([hz({ box: B(0.1, 0.1) })], 1000);
    const r = tr.update([hz({ box: B(0.18, 0.1) })], 2000);
    ok("pomeren predmet je i dalje jedan", r.length === 1, `${r.length}`);
    const x = r[0].box.x;
    ok("okvir se pomera postupno", x > 0.1 && x < 0.18, `x=${x.toFixed(3)}`);
  }

  // 7b. Predmet koji je za jedan prolaz prešao više od svoje širine i dalje
  //     je isti predmet. Prolaz traje sekundu i više — šolja u ruci pređe
  //     toliko bez problema, a okviri se tada uopšte ne dodiruju.
  {
    const tr = new HazardTracker();
    const a = tr.update([hz({ box: B(0.1, 0.1) })], 1000);
    const b = tr.update([hz({ box: B(0.35, 0.1) })], 2000);
    ok("predmet koji je odskočio ostaje isti", b.length === 1 && a[0].id === b[0].id,
      `${b.length} komada, ${a[0]?.id}→${b[0]?.id}`);
  }

  // 7c. …ali predmet na sasvim drugom kraju kadra NIJE isti predmet.
  {
    const tr = new HazardTracker();
    tr.update([hz({ box: B(0.05, 0.05) })], 1000);
    const r = tr.update([hz({ box: B(0.75, 0.75) })], 2000);
    ok("daleki predmet je nov nalaz", r.length === 2, `${r.length}`);
  }

  // 8. Ako petlja stane, okviri ne smeju da ostanu zamrznuti zauvek.
  {
    const tr = new HazardTracker();
    tr.update([hz({ box: B(0.3, 0.3) })], 1000);
    tr.update([hz({ box: B(0.3, 0.3) })], 2000);
    ok("zaglavljen nalaz se posle dužeg vremena odbacuje",
      tr.update([hz({ box: B(0.9, 0.9), src: "oven", label: "Šporet", category: "burn" })], 60000)
        .every((h) => h.label !== "Činija"));
  }

  return log;
});

await browser.close();
out.forEach((l) => console.log(l));
const bad = out.filter((l) => l.startsWith("✗"));
console.log(`\n${out.length - bad.length}/${out.length} u redu`);
process.exit(bad.length ? 1 : 0);
