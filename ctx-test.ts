import { recommendationsFor, solutionQuery } from "./src/lib/products";
localStorage.setItem("safenest.lang", "sr");
const CASES = [
  { label: "Vrela šolja kafe", category: "burn", solution: "spill proof insulated mug" },
  { label: "Gajtan roletne", category: "strangulation", solution: "blind cord safety winder" },
  { label: "Oštra ivica stola", category: "cutting", solution: "corner edge protectors" },
  { label: "Stepenice bez kapije", category: "fall", solution: "baby stair gate" },
  { label: "Lekovi na stolu", category: "poisoning", solution: "lockable medicine box" },
  { label: "Šolja na ivici", category: "burn", sourceClass: "cup" },
];
(async () => {
  const out: any[] = [];
  for (const c of CASES) {
    const recs = await recommendationsFor(c as any);
    out.push({ nalaz: c.label, upit: solutionQuery(c as any), preporuke: recs.map((r) => (r.isSearch ? "S " : "P ") + r.title) });
  }
  (window as any).__out = out;
})();
