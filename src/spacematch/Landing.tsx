import { useState } from "react";
import { t } from "./i18n";
import { Signup } from "./Signup";

const SECTORS = [
  { en: "Art galleries", sr: "Galerije" },
  { en: "Furniture", sr: "Nameštaj" },
  { en: "Lighting", sr: "Rasveta" },
  { en: "Interior design", sr: "Enterijer" },
  { en: "Kitchens", sr: "Kuhinje" },
  { en: "Flooring & rugs", sr: "Podovi i tepisi" },
  { en: "Real estate staging", sr: "Uređenje nekretnina" },
];

const PLANS = [
  { name: "Starter", key: "starter", price: "£49", items: ["50 pieces", "300 scans / month", "Embed widget", "Email support"] },
  { name: "Professional", key: "professional", price: "£149", items: ["500 pieces", "3 000 scans / month", "Custom branding", "CSV import"], on: true },
  { name: "Business", key: "business", price: "£399", items: ["5 000 pieces", "25 000 scans / month", "Custom domain", "Priority support"] },
  { name: "Enterprise", key: "enterprise", price: "Talk to us", items: ["Unlimited catalogue", "Multiple studios", "API access", "Onboarding"] },
];

interface Props {
  lang: "en" | "sr";
  onLang: (l: "en" | "sr") => void;
  onDemo: () => void;
  onStudio: () => void;
}

/** Javna stranica odeljenja — prodaje sistem, ne objašnjava tehnologiju. */
export function Landing({ lang, onLang, onDemo, onStudio }: Props) {
  const origin = typeof location !== "undefined" ? location.origin : "https://safenessai.co.uk";
  // null = zatvoreno; string = otvoreno sa unapred izabranim planom
  const [signup, setSignup] = useState<string | null>(null);
  return (
    <>
      <header className="sm-top">
        <div className="sm-brand">
          <span className="sm-brand-mark">SM</span>
          SpaceMatch AI
        </div>
        <nav>
          <button className="sm-link" onClick={onStudio}>
            {t("d.studio")}
          </button>
          <button className="sm-link" onClick={() => onLang(lang === "en" ? "sr" : "en")}>
            {lang === "en" ? "SR" : "EN"}
          </button>
          <button className="sm-btn sm-btn-accent" onClick={() => setSignup("")}>
            {t("d.talk")}
          </button>
        </nav>
      </header>

      <section className="sm-hero sm-wrap sm-stagger">
        <p className="sm-kicker">{t("d.kicker")}</p>
        <h1 className="sm-display">{t("d.h1")}</h1>
        <p>{t("d.sub")}</p>
        <div className="sm-hero-actions">
          <button className="sm-btn sm-btn-accent sm-btn-lg" onClick={onDemo}>
            {t("d.try")}
          </button>
          <button className="sm-btn sm-btn-quiet sm-btn-lg" onClick={() => setSignup("")}>
            {t("d.cta")}
          </button>
        </div>
        <div className="sm-strip">
          <span className="sm-kicker" style={{ margin: 0, alignSelf: "center" }}>
            {t("d.for")}
          </span>
          {SECTORS.map((s) => (
            <span className="sm-tag" key={s.en}>
              {lang === "sr" ? s.sr : s.en}
            </span>
          ))}
        </div>
      </section>

      <section className="sm-section sm-wrap" id="how">
        <h2 className="sm-display">{t("d.how")}</h2>
        <div className="sm-steps">
          {[1, 2, 3, 4].map((n) => (
            <div className="sm-step" key={n}>
              <i>{n}</i>
              <b>{t(`d.s${n}t`)}</b>
              <span>{t(`d.s${n}d`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="sm-section sm-wrap" id="pricing">
        <h2 className="sm-display">{t("d.pricing")}</h2>
        <div className="sm-plans">
          {PLANS.map((p) => (
            <div className={`sm-plan${p.on ? " sm-plan-on" : ""}`} key={p.name}>
              <b>{p.name}</b>
              <div className="sm-price">
                {p.price}
                {p.price.startsWith("£") && <small>{t("d.month")}</small>}
              </div>
              <ul>
                {p.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <button
                className={`sm-btn ${p.on ? "sm-btn-accent" : "sm-btn-quiet"}`}
                style={{ marginTop: "auto" }}
                onClick={() => setSignup(p.key)}
              >
                {t("b.cta")}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="sm-section sm-wrap">
        <h2 className="sm-display">{t("d.embed")}</h2>
        <div className="sm-code">{`<script src="${origin}/spacematch.js" data-studio="your-studio" defer><\/script>`}</div>
        <p className="sm-muted" style={{ marginTop: 12 }}>
          {t("d.embedNote")}
        </p>
      </section>

      <footer className="sm-foot sm-wrap">
        <span>SpaceMatch AI · Nicholas Family LTD, London</span>
        <span>
          <a className="sm-link" href="/">
            SafeNest AI
          </a>
          {" · "}
          <a className="sm-link" href="/privacy.html">
            Privacy
          </a>
          {" · "}
          <a className="sm-link" href="/terms.html">
            Terms
          </a>
        </span>
      </footer>

      {signup !== null && <Signup plan={signup} onClose={() => setSignup(null)} />}
    </>
  );
}
