/**
 * Provera prosuđivanja po prostoru.
 *
 * Merenje na pravoj fotografiji pokazuje da se šum uklonio, ali ne pokazuje
 * da pravila rade — na toj kuhinji YOLO uopšte ne prepoznaje šporet, pa se
 * pravilo o izvoru toplote nikad ne oglasi. Ovde se svaki slučaj postavlja
 * namerno, pa se vidi i ono što fotografija slučajno ne sadrži.
 */
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5199/app/", { waitUntil: "domcontentloaded" });

const out = await page.evaluate(async () => {
  const { judgeByContext } = await import("/src/lib/context.ts");
  const log = [];
  const ok = (n, c, e = "") => log.push(`${c ? "✓" : "✗"} ${n}${e ? " — " + e : ""}`);

  const hz = (src, label, box, o = {}) => ({
    id: src + label, label, category: o.category ?? "other",
    severity: o.severity ?? "medium", box, why: "", stats: "", fix: "",
    sourceClass: src, confidence: 0.8,
  });
  // y raste nadole: y=0.05 je pri plafonu, y=0.85 je pri podu.
  const high = { x: 0.4, y: 0.05, w: 0.12, h: 0.1 };
  const low = { x: 0.4, y: 0.82, w: 0.12, h: 0.1 };

  // 1. Svakodnevni predmet pod plafonom nije opasnost za dete koje puzi.
  {
    const r = judgeByContext([hz("bowl", "Činija", high)], "1-2y");
    ok("činija pri plafonu se ne prijavljuje", r.length === 0, `${r.length}`);
  }
  // 2. Ista ta činija na podu jeste.
  {
    const r = judgeByContext([hz("bowl", "Činija", low)], "1-2y");
    ok("činija nadohvat se prijavljuje", r.length === 1, `${r.length}`);
    ok("i kaže zašto", r[0]?.contextNote === "nadohvat detetu", r[0]?.contextNote);
  }
  // 3. Nož je nož i na najvišoj polici — odatle pada.
  {
    const r = judgeByContext([hz("knife", "Nož", high, { category: "cutting", severity: "critical" })], "1-2y");
    ok("nož visoko se i dalje prijavljuje", r.length === 1, `${r.length}`);
  }
  // 4. Lonac NA šporetu je vreo, ma gde u kadru bio.
  {
    const stove = hz("oven", "Šporet", { x: 0.3, y: 0.5, w: 0.4, h: 0.3 }, { category: "burn", severity: "high" });
    const pot = hz("bowl", "Lonac", { x: 0.42, y: 0.42, w: 0.14, h: 0.12 });
    const r = judgeByContext([stove, pot], "1-2y");
    const found = r.find((h) => h.label === "Lonac");
    ok("lonac na šporetu se prijavljuje", !!found, `${r.length} nalaza`);
    ok("i to kao opekotina", found?.category === "burn", found?.category);
    ok("sa podignutom ozbiljnošću", found?.severity === "high", found?.severity);
    ok("i objašnjenjem", found?.contextNote === "na izvoru toplote", found?.contextNote);
  }
  // 5. Dohvat raste sa uzrastom: ono što beba ne dohvata, četvorogodišnjak da.
  {
    const mid = { x: 0.4, y: 0.45, w: 0.12, h: 0.1 };
    const beba = judgeByContext([hz("bowl", "Činija", mid)], "0-6m");
    const veci = judgeByContext([hz("bowl", "Činija", mid)], "4-7y");
    ok("beba ne dohvata policu na sredini", beba.length === 0, `${beba.length}`);
    ok("starije dete dohvata", veci.length === 1, `${veci.length}`);
  }
  // 6. Prosuđivanje ne sme da pojede SVE — soba puna stvarnih opasnosti
  //    mora da prođe čitava.
  {
    const many = [
      hz("knife", "Nož", { x: 0.1, y: 0.8, w: 0.08, h: 0.05 }, { severity: "critical" }),
      hz("scissors", "Makaze", { x: 0.3, y: 0.85, w: 0.07, h: 0.04 }, { severity: "critical" }),
      hz("oven", "Šporet", { x: 0.5, y: 0.6, w: 0.3, h: 0.3 }, { severity: "high" }),
      hz("toaster", "Toster", { x: 0.2, y: 0.55, w: 0.1, h: 0.08 }, { severity: "high" }),
    ];
    const r = judgeByContext(many, "1-2y");
    ok("prave opasnosti prolaze sve", r.length === 4, `${r.length}/4`);
  }

  return log;
});

await browser.close();
out.forEach((l) => console.log(l));
const bad = out.filter((l) => l.startsWith("✗"));
console.log(`\n${out.length - bad.length}/${out.length} u redu`);
process.exit(bad.length ? 1 : 0);
