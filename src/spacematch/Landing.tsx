import { useEffect, useRef, useState } from "react";
import { analyzeSpace, downscale, recommend, call, type Match, type RoomProfile } from "./api";
import { aiLanguage, getLang, t, type Lang } from "./i18n";
import { LangPicker } from "./LangPicker";
import { Signup } from "./Signup";

interface Props {
  lang: Lang;
  onLang: (l: Lang) => void;
  onDemo: () => void;
  onStudio: () => void;
}

/* --------------------------------------------------------------- ikone */
const Check = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9.5" strokeWidth="1.6" />
    <path d="m8 12.3 2.7 2.7L16 9.6" />
  </svg>
);
const Arrow = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12h15m-6-6 6 6-6 6" />
  </svg>
);
const Mark = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8V5.6A2.6 2.6 0 0 1 5.6 3H8M16 3h2.4A2.6 2.6 0 0 1 21 5.6V8M21 16v2.4a2.6 2.6 0 0 1-2.6 2.6H16M8 21H5.6A2.6 2.6 0 0 1 3 18.4V16" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Sitne linijske sličice — bez ijedne spoljne slike, pa stranica leti. */
const ART: Record<string, JSX.Element> = {
  sofa: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 30v-9a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v9" />
      <path d="M8 30a3 3 0 0 1 3-3h42a3 3 0 0 1 3 3v7H8Z" />
      <path d="M14 37v4M50 37v4M22 27v-8M42 27v-8" />
    </svg>
  ),
  frame: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="19" y="8" width="26" height="32" rx="2" />
      <path d="m24 33 7-8 5 5 4-4 4 7Z" />
      <circle cx="27.5" cy="16.5" r="2.2" />
    </svg>
  ),
  lamp: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 6v8M22 24l4-10h12l4 10Z" />
      <path d="M32 24v6M26 40h12" />
      <path d="M28 30h8l-2 10h-4Z" />
    </svg>
  ),
  kitchen: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="10" y="20" width="44" height="20" rx="2" />
      <path d="M10 26h44M32 26v14" />
      <path d="M18 32h4M42 32h4" />
      <path d="M14 8h14v8H14zM36 8h14v8H36z" />
    </svg>
  ),
  rug: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16h40l-4 22H16Z" />
      <path d="M18 22h28M17 28h30M16 34h32" />
    </svg>
  ),
  bed: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 36V16M8 26h48v10M56 22v14" />
      <path d="M16 26v-6h14v6" />
      <path d="M12 36v4M52 36v4" />
    </svg>
  ),
  house: (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 24 32 10l18 14v16H14Z" />
      <path d="M27 40V29h10v11" />
    </svg>
  ),
};

const IND = [
  { key: "d.v2", art: "sofa", tint: "#e9e2d8" },
  { key: "d.v1", art: "frame", tint: "#e4ecea" },
  { key: "d.v3", art: "lamp", tint: "#eae6dd" },
  { key: "d.v5", art: "kitchen", tint: "#e3ebe9" },
  { key: "d.v6", art: "rug", tint: "#ece5da" },
  { key: "d.v7", art: "bed", tint: "#e6ebe8" },
] as const;

interface Plan {
  key: string;
  name: string;
  /** Mesečna cena u funtama. */
  m: number;
  /** Cena je donja granica — velikim sistemima se pravi ponuda. */
  from?: boolean;
  desc: string;
  on?: boolean;
  feats: [string, string][];
}

/**
 * Lestvica je namerno strma. Galerija sa jednom prostorijom i lanac sa
 * sto salona ne dobijaju istu vrednost od istog alata: prvom je to lep
 * dodatak, drugom je to prodajni kanal. Zato ulaz mora biti dovoljno
 * jeftin da se ne razmišlja, a vrh dovoljno visok da nosi ugovor,
 * uvođenje i odgovornost koju veliki sistem traži.
 */
const PLANS: Plan[] = [
  {
    key: "starter", name: "Starter", m: 89, desc: "pd.1",
    feats: [["pf.pieces", "150"], ["pf.scans", "750"], ["pf.embed", ""], ["pf.support", ""]],
  },
  {
    key: "professional", name: "Professional", m: 349, desc: "pd.2", on: true,
    feats: [["pf.pieces", "1 500"], ["pf.scans", "7 500"], ["pf.branding", ""], ["pf.csv", ""], ["pf.stores", "3"]],
  },
  {
    key: "business", name: "Business", m: 1190, desc: "pd.3",
    feats: [["pf.pieces", "15 000"], ["pf.scans", "40 000"], ["pf.stores", "10"], ["pf.domain", ""], ["pf.feed", ""], ["pf.api", ""]],
  },
  {
    key: "enterprise", name: "Enterprise", m: 3500, from: true, desc: "pd.4",
    feats: [["pf.unlimited", ""], ["pf.storesUnl", ""], ["pf.sso", ""], ["pf.sla", ""], ["pf.rules", ""], ["pf.manager", ""]],
  },
];

const FLOW = ["c.f1", "c.f2", "c.f3", "c.f4", "c.f5"];

/**
 * Javna stranica odeljenja. Prodaje sistem, ne objašnjava tehnologiju —
 * i sve što tvrdi mora da bude proverljivo, jer je ovo prvo što klijent
 * vidi pre nego što nam poveri svoj katalog.
 */
export function Landing({ lang, onLang, onDemo, onStudio }: Props) {
  const origin = typeof location !== "undefined" ? location.origin : "https://safenessai.co.uk";
  const [signup, setSignup] = useState<string | null>(null);
  const [annual, setAnnual] = useState(false);
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${origin}/spacematch.js" data-studio="your-studio" defer></script>`;

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-nav-in">
          <a className="lp-logo" href="/spacematch/">
            <span className="lp-logo-mark"><Mark /></span>
            SpaceMatch AI
          </a>
          <div className="lp-menu">
            <a href="#how">{t("d.how")}</a>
            <a href="#industries">{t("n.industries")}</a>
            <a href="#pricing">{t("d.pricing")}</a>
            <a href="#embed">{t("n.product")}</a>
          </div>
          <div className="lp-nav-cta">
            <LangPicker lang={lang} onLang={onLang} compact />
            <button className="lb lb-ghost lb-sm" onClick={onStudio}>{t("n.login")}</button>
            <button className="lb lb-primary lb-sm" onClick={() => setSignup("")}>{t("d.talk")}</button>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------ hero */}
      <header className="lp-wrap lp-hero">
        <div className="lp-in">
          <span className="lp-badge">✦ {t("h.badge")}</span>
          <h1>{t("d.h1")}</h1>
          <p>{t("d.sub")}</p>
          <div className="lp-checks">
            {["h.f1", "h.f2", "h.f3"].map((k) => (
              <span className="lp-check" key={k}><Check /> {t(k)}</span>
            ))}
          </div>
          <div className="lp-hero-cta">
            <button className="lb lb-primary lb-lg" onClick={() => setSignup("")}>
              {t("h.book")} <Arrow />
            </button>
            <button className="lb lb-ghost lb-lg" onClick={onDemo}>{t("d.try")}</button>
          </div>
          <div className="lp-proof">
            <span className="lp-faces">
              <span style={{ background: "#0f766e" }}>13</span>
              <span style={{ background: "#1f8f83" }}>7</span>
              <span style={{ background: "#0c5c55" }}>1</span>
            </span>
            <p>{t("h.proof")}</p>
          </div>
        </div>

        <div className="lp-shot lp-in">
          <div className="lp-laptop">
            <div className="lp-bar"><i /><i /><i /><b>{t("ty.recfor")}</b></div>
            <div className="lp-lap-body">
              <h4>{t("ty.recfor")}</h4>
              <div className="lp-pills">
                <span className="on">{t("d.v2")}</span>
                <span>{t("d.v1")}</span>
                <span>{t("d.v3")}</span>
                <span>{t("d.v6")}</span>
              </div>
              <div className="lp-grid4">
                {[["sofa", "#e9e2d8", "£899", "d.v2"], ["frame", "#e4ecea", "£249", "d.v1"], ["lamp", "#eae6dd", "£139", "d.v3"]].map(([art, tint, price, label]) => (
                  <div className="lp-card" key={art}>
                    <div className="lp-thumb" style={{ background: tint, color: "#6b7c78" }}>
                      <span style={{ width: 44, display: "block" }}>{ART[art]}</span>
                    </div>
                    <b>{t(label)}</b>
                    <span>{price}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lp-phone">
            <div className="lp-step-mini"><i>1</i> {t("ty.upload")}</div>
            <div className="lp-mini-img" style={{ background: "linear-gradient(150deg,#e7ece9,#d7e2df)" }} />
            <div className="lp-step-mini"><i>2</i> {t("ty.analyzing")}</div>
            <div className="lp-mini-img" style={{ background: "linear-gradient(150deg,#0d2f2a,#14857a)" }} />
            <div className="lp-step-mini"><i>3</i> {t("ty.recfor")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["sofa", "frame"].map((a) => (
                <div key={a} style={{ flex: 1, background: "#eef2f1", borderRadius: 8, aspectRatio: "1", display: "grid", placeItems: "center", color: "#6b7c78" }}>
                  <span style={{ width: 34, display: "block" }}>{ART[a]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-float">
            <Check s={15} />
            <span>{t("s.match")} <b>94%</b></span>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------ traka logoa */}
      <section className="lp-strip">
        <div className="lp-wrap">
          <p className="lp-strip-t">{t("st.title")}</p>
          <div className="lp-strip-row">
            <span>Shopify</span><span>WooCommerce</span><span>Stripe</span>
            <span>Supabase</span><span>NVIDIA</span><span>Gemini</span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- kako radi */}
      <section className="lp-sec lp-wrap" id="how">
        <h2 className="lp-h2">{t("w.title")}</h2>
        <div className="lp-steps">
          {[1, 2, 3, 4].map((n) => (
            <div className="lp-step" key={n}>
              <span className="lp-step-n">{n}</span>
              <b>{t(`d.s${n}t`)}</b>
              <p>{t(`d.s${n}d`)}</p>
              <div
                className="lp-step-art"
                style={{
                  background: ["linear-gradient(150deg,#eef2f1,#dde7e4)", "linear-gradient(150deg,#0d2f2a,#17a094)", "linear-gradient(150deg,#f2efe8,#e3ddd2)", "linear-gradient(150deg,#e8f4f1,#cfe6e1)"][n - 1],
                  color: n === 2 ? "rgba(255,255,255,.85)" : "#7b8b87",
                }}
              >
                <span style={{ width: 62, display: "block" }}>
                  {[ART.house, ART.lamp, ART.sofa, ART.frame][n - 1]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ traka brojki */}
      <section className="lp-wrap lp-sec-tight">
        <div className="lp-band">
          {[["8 s", "bd.1l"], ["13", "bd.2l"], ["1", "bd.3l"], ["0", "bd.4l"]].map(([v, k]) => (
            <div className="lp-band-i" key={k}>
              <b>{v}</b>
              <span>{t(k)}</span>
            </div>
          ))}
          <div className="lp-band-note">{t("bd.note")}</div>
        </div>
      </section>

      {/* -------------------------------------------------------- industrije */}
      <section className="lp-sec lp-wrap" id="industries">
        <h2 className="lp-h2 lp-h2-left">{t("i.title")}</h2>
        <div className="lp-inds">
          {IND.map((i) => (
            <div className="lp-ind" key={i.key}>
              <div className="lp-ind-art" style={{ background: i.tint, color: "#6b7c78" }}>
                <span style={{ width: 58, display: "block" }}>{ART[i.art]}</span>
              </div>
              <b>{t(i.key)}</b>
            </div>
          ))}
          <button className="lp-ind lp-ind-all" onClick={() => setSignup("")}>
            <Arrow s={18} />
            <span>{t("i.all")}</span>
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------- probaj sam */}
      <section className="lp-sec lp-wrap">
        <div className="lp-panel">
          <div>
            <h2>{t("ty.title")}</h2>
            <p>{t("ty.sub")}</p>
            <div className="lp-list">
              {["ty.b1", "ty.b2", "ty.b3"].map((k) => (
                <div key={k}><Check /> {t(k)}</div>
              ))}
            </div>
            <button className="lb lb-primary" style={{ marginTop: 20 }} onClick={onDemo}>{t("d.try")}</button>
          </div>
          <TryItYourself />
        </div>
      </section>

      {/* ------------------------------------------------------------- kod */}
      <section className="lp-sec lp-wrap" id="embed">
        <div className="lp-panel">
          <div>
            <h2>{t("d.embed")}</h2>
            <p>{t("d.embedNote")}</p>
            <div className="lp-list">
              {["c.b1", "c.b2", "c.b3"].map((k) => (
                <div key={k}><Check /> {t(k)}</div>
              ))}
            </div>
          </div>
          <div>
            <div className="lp-code">
              <div className="lp-code-head">{t("c.head")}</div>
              <pre>{snippet}</pre>
              <button
                className="lp-copy"
                onClick={() => {
                  navigator.clipboard?.writeText(snippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                {copied ? t("c.copied") : t("c.copy")}
              </button>
            </div>
            <p style={{ fontSize: "0.78rem", marginTop: 14, fontWeight: 600, color: "#6d7d7a" }}>{t("c.next")}</p>
            <div className="lp-flow">
              {FLOW.map((k, i) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div className="lp-flow-i">
                    <i><Mark /></i>
                    <span>{t(k)}</span>
                  </div>
                  {i < FLOW.length - 1 && <span className="lp-flow-arrow"><Arrow s={13} /></span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- analitika */}
      <section className="lp-sec lp-wrap">
        <div className="lp-panel">
          <div>
            <h2>{t("an.t1")}</h2>
            <p>{t("an.sub")}</p>
            <button className="lb lb-ghost" style={{ marginTop: 18 }} onClick={onStudio}>
              {t("an.cta")} <Arrow />
            </button>
          </div>
          <div className="lp-dash">
            <div className="lp-dash-head">
              <b>{t("a.insight")}</b>
              <span>{t("an.example")}</span>
            </div>
            <div className="lp-kpis">
              {[["an.k1", "24,532"], ["an.k2", "8,725"], ["an.k3", "21,142"], ["an.k4", "3.62%"], ["an.k5", "£126,430"]].map(([k, v]) => (
                <div className="lp-kpi" key={k}>
                  <span>{t(k)}</span>
                  <b>{v}</b>
                  <i>▲</i>
                </div>
              ))}
            </div>
            <div className="lp-chart">
              <svg viewBox="0 0 320 90" style={{ width: "100%", height: "auto" }} aria-hidden="true">
                <polyline points="0,72 32,66 64,68 96,55 128,58 160,44 192,40 224,30 256,32 288,18 320,12"
                  fill="none" stroke="#0f766e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="0,82 32,79 64,80 96,72 128,74 160,66 192,63 224,57 256,58 288,49 320,44"
                  fill="none" stroke="#9ad0c9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- cenovnik */}
      <section className="lp-sec lp-wrap" id="pricing">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <h2 className="lp-h2 lp-h2-left">{t("pr.t1")} <span style={{ color: "var(--l-body)" }}>{t("pr.t2")}</span></h2>
            <p style={{ maxWidth: "42ch", marginTop: 10 }}>{t("pr.sub")}</p>
            <div className="lp-toggle">
              <button className={annual ? "" : "on"} onClick={() => setAnnual(false)}>{t("pr.monthly")}</button>
              <button className={annual ? "on" : ""} onClick={() => setAnnual(true)}>{t("pr.annual")}</button>
            </div>
          </div>
        </div>

        <div className="lp-plans">
          {PLANS.map((p) => (
            <div className={`lp-plan${p.on ? " lp-plan-on" : ""}`} key={p.key}>
              {p.on && <span className="lp-plan-tag">{t("pr.popular")}</span>}
              <h3>{p.name}</h3>
              <div className="lp-plan-price">
                {p.from && <em>{t("pr.from")} </em>}
                £{(annual ? Math.round(p.m * 0.8) : p.m).toLocaleString("en-GB")}
                <small>{t("d.month")}</small>
              </div>
              <p>{t(p.desc)}</p>
              <ul>
                {p.feats.map(([k, n]) => (
                  <li key={k}><Check s={15} /> {t(k).replace("{n}", n)}</li>
                ))}
              </ul>
              <button
                className={`lb ${p.on ? "lb-primary" : "lb-ghost"} lb-block`}
                onClick={() => setSignup(p.key)}
              >
                {p.from ? t("pr.talk") : t("pr.start")}
              </button>
            </div>
          ))}
        </div>
        <p className="lp-plan-note">{t("pr.note")}</p>
        <p className="lp-plan-note lp-plan-fine">{t("pr.overage")}</p>
        <p className="lp-plan-note lp-plan-fine">{t("pr.setup")}</p>
      </section>

      {/* --------------------------------------------------------- podnožje */}
      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-grid">
            <div>
              <span className="lp-logo">
                <span className="lp-logo-mark"><Mark /></span>
                SpaceMatch AI
              </span>
              <p>{t("d.sub")}</p>
            </div>
            <div>
              <h5>{t("n.product")}</h5>
              <a href="#how">{t("d.how")}</a>
              <a href="#industries">{t("n.industries")}</a>
              <a href="#pricing">{t("d.pricing")}</a>
              <a href="?t=demo">{t("d.try")}</a>
            </div>
            <div>
              <h5>{t("f.business")}</h5>
              <a href="#pricing">{t("d.cta")}</a>
              <a href="?studio=1">{t("d.studio")}</a>
              <a href="#embed">{t("a.embed")}</a>
            </div>
            <div>
              <h5>{t("f.company")}</h5>
              <a href="/">SafeNest AI</a>
              <a href="mailto:office@aichatbot.rs">{t("f.contact")}</a>
              <a href="/privacy.html">{t("f.privacy")}</a>
              <a href="/terms.html">{t("f.terms")}</a>
            </div>
            <Newsletter />
          </div>
          <div className="lp-foot-bottom">
            <span>© 2026 Nicholas Family LTD. {t("f.rights")}</span>
            <span>{t("f.made")}</span>
          </div>
        </div>
      </footer>

      {signup !== null && <Signup plan={signup} onClose={() => setSignup(null)} />}
    </div>
  );
}

/**
 * „Probaj sam" nije animacija nego PRAVI skener nad demo katalogom —
 * posetilac koji vidi svoj sopstveni prostor ne mora ništa da nam veruje.
 */
function TryItYourself() {
  const [stage, setStage] = useState<"idle" | "busy" | "done" | "fail">("idle");
  const [shot, setShot] = useState<string | null>(null);
  const [profile, setProfile] = useState<RoomProfile | null>(null);
  const [items, setItems] = useState<Match[]>([]);
  const file = useRef<HTMLInputElement>(null);

  const run = async (f: File) => {
    setStage("busy");
    try {
      const image = await downscale(f, 1024);
      setShot(image);
      const p = await analyzeSpace("demo", image, aiLanguage());
      setProfile(p);
      const r = await recommend("demo", p, {}, getLang());
      setItems(r.recommendations);
      setStage("done");
    } catch {
      setStage("fail");
    }
  };

  return (
    <div className="lp-try">
      <div className="lp-try-col">
        <div className="lp-step-mini"><i>1</i> {t("ty.upload")}</div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />
        {shot ? (
          <img className="lp-try-shot" src={shot} alt="" />
        ) : (
          <button className="lp-drop" onClick={() => file.current?.click()}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4m-5 5 5-5 5 5" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <b>{t("ty.click")}</b>
            <span>{t("ty.drag")}</span>
          </button>
        )}
      </div>

      <div className="lp-try-col">
        <div className="lp-step-mini"><i>2</i> {t("ty.analyzing")}</div>
        {stage === "busy" ? (
          <svg className="lp-spin" viewBox="0 0 60 60">
            <circle className="bg" cx="30" cy="30" r="24" />
            <circle className="fg" cx="30" cy="30" r="24" />
          </svg>
        ) : profile ? (
          <div style={{ fontSize: "0.78rem", color: "#33443f", lineHeight: 1.7 }}>
            <div><b style={{ textTransform: "capitalize" }}>{profile.style}</b></div>
            <div style={{ textTransform: "capitalize" }}>{profile.lighting}</div>
            <div>{Math.round(profile.wallWidth)} × {Math.round(profile.wallHeight)} cm</div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {profile.dominantColors.slice(0, 4).map((c) => (
                <i key={c} style={{ width: 18, height: 18, borderRadius: 5, background: c, display: "block" }} />
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "0.78rem", margin: 0 }}>{stage === "fail" ? t("s.failed") : t("ty.b2")}</p>
        )}
      </div>

      <div className="lp-try-col">
        <div className="lp-step-mini"><i>3</i> {t("ty.recfor")}</div>
        <div className="lp-try-rec">
          {items.length > 0
            ? items.map((m) => (
                <div className="lp-try-item" key={m.id}>
                  {m.image_url ? <img src={m.image_url} alt="" loading="lazy" /> : <span className="lp-ph" style={{ background: "#eef2f1" }} />}
                  <span>
                    <b>{m.title}</b>
                    <span>{m.match}% {t("s.match")}</span>
                  </span>
                </div>
              ))
            : [0, 1, 2].map((i) => (
                <div className="lp-try-item" key={i}>
                  <span className="lp-ph" style={{ background: "#eef2f1", display: "block" }} />
                  <span style={{ flex: 1, height: 9, background: "#eef2f1", borderRadius: 6 }} />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

/** Prijava na vesti je pravi upis u naš CRM, ne ukras. */
function Newsletter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return;
    try {
      await call({
        action: "signup",
        company: email.trim().split("@")[1] ?? "newsletter",
        email: email.trim(),
        message: "newsletter",
        source: "newsletter",
      });
      setSent(true);
      setEmail("");
    } catch {
      setSent(true);
    }
  };

  return (
    <div>
      <h5>{t("f.stay")}</h5>
      <p>{t("f.staySub")}</p>
      <div className="lp-sub">
        <input
          type="email"
          value={email}
          placeholder={t("f.emailPh")}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label={t("f.emailPh")}
        />
        <button onClick={submit} aria-label={t("q.send")}><Arrow /></button>
      </div>
      {sent && <p style={{ marginTop: 8, color: "#7fd8cc" }}>{t("f.thanks")}</p>}
    </div>
  );
}

/** Sekcije se pojavljuju kad uđu u vidno polje — bez skoka sadržaja. */
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".lp-sec, .lp-band, .lp-panel");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("lp-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "-40px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
