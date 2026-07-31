import { createRoot } from "react-dom/client";
import { useState } from "react";
import { rankHazards } from "./src/lib/priority";
import { SEVERITY_META } from "./src/types";
import type { Hazard } from "./src/types";
import { severityLabel } from "./src/lib/i18n";
localStorage.setItem("safenest.lang", "sr");

// Isti scenario kao sa snimka: 9 nalaza, 3 iste stolice, preklopljeni
const HZ: Hazard[] = [
  { id:"1", label:"krevet na sprat", category:"fall", severity:"critical", box:{x:.02,y:.28,w:.95,h:.62}, why:"Visok je i nema zaštitnu ogradu.", stats:"", fix:"Postavi ogradu.", resolved:false },
  { id:"2", label:"sklopiva stolica", category:"crush", severity:"high", box:{x:.16,y:.30,w:.72,h:.42}, why:"", stats:"", fix:"", resolved:false },
  { id:"3", label:"kablovi", category:"strangulation", severity:"high", box:{x:.01,y:.29,w:.14,h:.30}, why:"", stats:"", fix:"", resolved:false },
  { id:"4", label:"stolica", category:"fall", severity:"medium", box:{x:.36,y:.41,w:.52,h:.30}, why:"", stats:"", fix:"", resolved:false },
  { id:"5", label:"stolica", category:"fall", severity:"medium", box:{x:.30,y:.44,w:.40,h:.28}, why:"", stats:"", fix:"", resolved:false },
  { id:"6", label:"stolica", category:"fall", severity:"medium", box:{x:.33,y:.47,w:.44,h:.30}, why:"", stats:"", fix:"", resolved:false },
  { id:"7", label:"ogledalo", category:"cutting", severity:"medium", box:{x:.55,y:.20,w:.42,h:.30}, why:"", stats:"", fix:"", resolved:false },
  { id:"8", label:"polica", category:"crush", severity:"medium", box:{x:.05,y:.32,w:.30,h:.40}, why:"", stats:"", fix:"", resolved:false },
  { id:"9", label:"kablovi", category:"strangulation", severity:"high", box:{x:.02,y:.30,w:.13,h:.28}, why:"", stats:"", fix:"", resolved:false },
];

function Demo() {
  const [i, setI] = useState(0);
  const ranked = rankHazards(HZ, "1-2y");
  const a = ranked[i % ranked.length];
  (window as any).__r = { total: HZ.length, cards: ranked.length, order: ranked.map(x => `${x.label}${x.count>1?"×"+x.count:""}`), active: a.label };
  return (
    <div className="live-wrap" style={{ background: "#6b7280" }}>
      <button className="hazard-box live-box live-spot" data-sev={a.severity}
        style={{ left:`${a.box.x*100}%`, top:`${a.box.y*100}%`, width:`${a.box.w*100}%`, height:`${a.box.h*100}%`,
          borderColor: SEVERITY_META[a.severity].color, ["--sev-glow" as any]: `${SEVERITY_META[a.severity].color}66` }}>
        <span className="live-tag">
          <span className="live-tag-num" style={{ background: SEVERITY_META[a.severity].color }}>{(i % ranked.length)+1}</span>
          <span className="live-tag-name">{a.label}{a.count>1 && ` ×${a.count}`}</span>
          <b className="live-tag-sev" style={{ color: SEVERITY_META[a.severity].color }}>{severityLabel(a.severity)}</b>
        </span>
      </button>
      <div className="live-pager">
        <button onClick={() => setI((x) => (x - 1 + ranked.length) % ranked.length)}>‹</button>
        <span>{(i % ranked.length)+1} / {ranked.length}</span>
        <button onClick={() => setI((x) => (x + 1) % ranked.length)}>›</button>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
