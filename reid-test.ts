import { reconcileWithMemory, unresolvedMemories, rememberResolved } from "./src/lib/memory";
import { hungarian } from "./src/lib/reid";
import type { Hazard } from "./src/types";
localStorage.clear();
localStorage.setItem("safenest.lang", "sr");

// Dve "fotografije": ista soba, isti predmeti, malo drugačiji ugao/pozicija
function scene(shift: number, extra = false): string {
  const c = document.createElement("canvas"); c.width = 400; c.height = 300;
  const x = c.getContext("2d")!;
  x.fillStyle = "#d9cbb5"; x.fillRect(0, 0, 400, 300);               // pod
  x.fillStyle = "#8b1a1a"; x.fillRect(40 + shift, 150, 70, 70);      // crvena šolja
  x.fillStyle = "#1a4f8b"; x.fillRect(220 + shift, 160, 60, 80);     // plava flaša
  if (extra) { x.fillStyle = "#2f7a2f"; x.fillRect(320, 40, 50, 50); } // nov zeleni predmet
  return c.toDataURL("image/jpeg", 0.9);
}
const hz = (id: string, label: string, cat: any, x: number, y: number, w: number, h: number): Hazard => ({
  id, label, category: cat, severity: "high", box: { x, y, w, h },
  why: "", stats: "", fix: "", resolved: false,
});

(async () => {
  const log: string[] = [];
  // SKEN 1
  const a = await reconcileWithMemory(scene(0), [
    hz("1", "Vrela šolja", "burn", 0.10, 0.50, 0.175, 0.233),
    hz("2", "Staklena flaša", "cutting", 0.55, 0.533, 0.15, 0.267),
  ], "kitchen");
  log.push(`Sken 1: prepoznato iz ranije = ${a.recognized} (očekivano 0), zapamćeno = ${unresolvedMemories("kitchen").length}`);

  // SKEN 2 — isti predmeti, pomereni + jedan nov
  const b = await reconcileWithMemory(scene(30, true), [
    hz("1", "Vrela šolja", "burn", 0.175, 0.50, 0.175, 0.233),
    hz("2", "Staklena flaša", "cutting", 0.625, 0.533, 0.15, 0.267),
    hz("3", "Zelena kutija", "choking", 0.80, 0.133, 0.125, 0.167),
  ], "kitchen");
  log.push(`Sken 2: prepoznato = ${b.recognized} (očekivano 2)`);
  log.push(`  šolja: viđeno ${b.hazards[0].timesSeen}× | flaša: viđeno ${b.hazards[1].timesSeen}× | nova: viđeno ${b.hazards[2].timesSeen}×`);
  log.push(`  nedostaje iz ranije: ${b.missing.length} (očekivano 0)`);

  // SKEN 3 — šolja sklonjena
  const c = await reconcileWithMemory(scene(30, true), [
    hz("2", "Staklena flaša", "cutting", 0.625, 0.533, 0.15, 0.267),
    hz("3", "Zelena kutija", "choking", 0.80, 0.133, 0.125, 0.167),
  ], "kitchen");
  log.push(`Sken 3 (šolja sklonjena): nedostaje = ${c.missing.map(m => m.label).join(", ") || "—"} (očekivano: Vrela šolja)`);

  // Potvrda rešenog
  if (c.missing[0]) rememberResolved(c.missing[0].id);
  log.push(`Posle potvrde 'rešeno': nerešenih u memoriji = ${unresolvedMemories("kitchen").length} (očekivano 2)`);

  // Druga prostorija ne sme da vidi tuđu memoriju
  const d = await reconcileWithMemory(scene(0), [hz("1", "Vrela šolja", "burn", 0.10, 0.50, 0.175, 0.233)], "bathroom");
  log.push(`Druga prostorija: prepoznato = ${d.recognized} (očekivano 0 — memorija je po prostoriji)`);

  // Hungarian sanity
  const asg = hungarian([[1, 9, 9], [9, 1, 9], [9, 9, 1]]);
  log.push(`Hungarian dijagonala: [${asg.join(",")}] (očekivano 0,1,2)`);

  (window as any).__log = log;
})();
