import { createRoot } from "react-dom/client";
import { useState } from "react";
import { HazardFocus } from "./src/components/HazardFocus";
import type { Hazard } from "./src/types";
localStorage.setItem("safenest.lang", "sr");
const MK = (i: number): Hazard => ({
  id: String(i),
  label: ["vrela šolja kafe","utičnica bez poklopca","oštra ivica stola","gajtan roletne","komoda bez ankera","sitna igračka"][i % 6],
  category: (["burn","electric","cutting","strangulation","crush","choking"] as any)[i % 6],
  severity: (["critical","high","medium","high","medium","critical"] as any)[i % 6],
  box: { x: 0.1 + (i % 3) * 0.25, y: 0.2 + (i % 4) * 0.15, w: 0.2, h: 0.15 },
  why: "Detaljno objašnjenje zašto je ovo opasno baš za dete uzrasta 1–2 godine i šta može da se desi.",
  stats: "", fix: "Pomeri predmet van domašaja. Postavi zaštitu.",
  steps: ["Pomeri predmet van domašaja", "Postavi zaštitu"],
  solution: ["spill proof insulated mug","plug socket covers","corner edge protectors","blind cord safety winder","furniture anti tip straps","cabinet safety locks"][i % 6],
  resolved: false,
});
const HZ = Array.from({ length: 9 }, (_, i) => MK(i));
const IMG = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#94a3b8"/></svg>');
function Demo() {
  const [hz, setHz] = useState(HZ);
  return <HazardFocus imageDataUrl={IMG} hazards={hz} baseScore={45} ageGroup="1-2y"
    onToggleResolved={(id) => setHz((p) => p.map((h) => (h.id === id ? { ...h, resolved: !h.resolved } : h)))}
    onBack={() => {}} onShare={() => {}} />;
}
createRoot(document.getElementById("root")!).render(<Demo />);
