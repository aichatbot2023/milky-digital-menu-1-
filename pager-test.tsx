import { createRoot } from "react-dom/client";
import { useState } from "react";
import { rankHazards } from "./src/lib/priority";
import { SEVERITY_META } from "./src/types";
import type { Hazard } from "./src/types";
import { severityLabel, t } from "./src/lib/i18n";
localStorage.setItem("safenest.lang", "sr");

const HZ: Hazard[] = Array.from({ length: 11 }, (_, i) => ({
  id: String(i), label: ["ekran laptopa","kablovi","šolja","stolica","ivica stola","utičnica","polica","ogledalo","torba","tepih","prozor"][i],
  category: (["fall","strangulation","burn","fall","cutting","electric","crush","cutting","choking","other","fall"] as any)[i],
  severity: (["high","high","critical","medium","medium","high","medium","low","medium","low","critical"] as any)[i],
  box: { x: 0.05 + (i % 3) * 0.28, y: 0.18 + Math.floor(i / 3) * 0.16, w: 0.26, h: 0.14 },
  why: "Kratko objašnjenje zašto je ovo opasno za dete uzrasta 1–2 godine.", stats: "", fix: "", resolved: false,
}));

function Demo() {
  const ranked = rankHazards(HZ, "1-2y");
  const [i, setI] = useState(0);
  const [all, setAll] = useState(false);
  const [touched, setTouched] = useState(false);
  const a = ranked[i];
  const count = ranked.length;
  (window as any).__r = { count, active: a.label };
  return (
    <div className="live-wrap" style={{ background: "#6b7280" }}>
      {all && ranked.map((h, j) => (
        <button key={h.id} className={`hazard-box live-box${j === i ? " live-box-active" : " live-box-dim"}`} data-sev={h.severity}
          style={{ left:`${h.box.x*100}%`, top:`${h.box.y*100}%`, width:`${h.box.w*100}%`, height:`${h.box.h*100}%`,
            borderColor: SEVERITY_META[h.severity].color, ["--sev-glow" as any]: `${SEVERITY_META[h.severity].color}66` }}
          onClick={() => { setI(j); setTouched(true); }}>
          <span className="live-pin" style={{ background: SEVERITY_META[h.severity].color }}>{j+1}</span>
          {j === i && <span className="live-tag live-tag-float"><span className="live-tag-name">{h.label}</span></span>}
        </button>
      ))}
      {!all && (
        <button className="hazard-box live-box live-spot" data-sev={a.severity}
          style={{ left:`${a.box.x*100}%`, top:`${a.box.y*100}%`, width:`${a.box.w*100}%`, height:`${a.box.h*100}%`,
            borderColor: SEVERITY_META[a.severity].color, ["--sev-glow" as any]: `${SEVERITY_META[a.severity].color}66` }}>
          <span className="live-tag">
            <span className="live-tag-num" style={{ background: SEVERITY_META[a.severity].color }}>{i+1}</span>
            <span className="live-tag-name">{a.label}{a.count>1 && ` ×${a.count}`}</span>
            <b className="live-tag-sev" style={{ color: SEVERITY_META[a.severity].color }}>{severityLabel(a.severity)}</b>
          </span>
        </button>
      )}
      <div className="live-topbar">
        <span className="live-status"><span className="live-dot" />{count} opasnosti</span>
        <div className="live-topbtns">
          <button className={`live-iconbtn${all ? " live-iconbtn-on" : ""}`} onClick={() => setAll(!all)}>{all ? "▦" : "◎"}</button>
          <button className="live-iconbtn">🔇</button>
        </div>
      </div>
      <div className="live-bottom">
        <div className={`pager${touched ? "" : " pager-hint"}`}>
          <button className="pager-arrow" onClick={() => { setI((x)=>(x-1+count)%count); setTouched(true); }}>‹</button>
          <div className="pager-dots">
            {ranked.slice(0,8).map((h,j)=>(<button key={h.id} className={`pager-dot${j===i?" pager-dot-on":""}`}
              style={j===i?{background:SEVERITY_META[h.severity].color}:undefined} onClick={()=>{setI(j);setTouched(true);}} />))}
            {count>8 && <span className="pager-more">+{count-8}</span>}
          </div>
          <button className="pager-arrow" onClick={() => { setI((x)=>(x+1)%count); setTouched(true); }}>›</button>
          <span className="pager-count">{i+1}/{count}</span>
        </div>
        <button className="live-strip">
          <span className="live-strip-sev" style={{ background: SEVERITY_META[a.severity].color }}>{severityLabel(a.severity)}</span>
          <span className="live-strip-body">
            <strong>{a.label}</strong>
            <span className="live-strip-why">{a.why}</span>
            <span className="live-strip-hint">{t("live.tapMore")}</span>
          </span>
        </button>
      </div>
      <div className="live-bottombar"><button className="btn btn-primary btn-finish">✓ Završi sken</button><button className="btn btn-close">✕</button></div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
