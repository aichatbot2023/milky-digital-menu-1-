import { useState } from "react";
import { call } from "./api";
import { t } from "./i18n";

interface Props {
  onClose: () => void;
  /** Plan koji je firma kliknula u cenovniku — unapred popunjen. */
  plan?: string;
}

const VERTICALS = [
  ["art", "Art gallery / wall art"],
  ["furniture", "Furniture"],
  ["lighting", "Lighting"],
  ["interior", "Interior design"],
  ["kitchen", "Kitchens"],
  ["flooring", "Flooring & rugs"],
  ["realestate", "Real estate staging"],
];

/**
 * Prijava FIRME koja želi da postane naš klijent (studio). Ovo nije upit
 * kupca — ovo je početak ugovora: zahtev stiže u konzolu vlasnika, odakle
 * se studio otvara jednim klikom i klijentu se šalje njegov ključ.
 */
export function Signup({ onClose, plan = "" }: Props) {
  const [f, setF] = useState({
    company: "",
    person: "",
    email: "",
    phone: "",
    website: "",
    vertical: "art",
    catalogue_size: "",
    plan,
    message: "",
  });
  const [state, setState] = useState<"" | "bad" | "sent" | "sending">("");
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  const submit = async () => {
    if (!f.company.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) {
      setState("bad");
      return;
    }
    setState("sending");
    try {
      await call({ action: "signup", ...f, email: f.email.trim() });
      setState("sent");
    } catch {
      setState("bad");
    }
  };

  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div key={k}>
      <label htmlFor={`b-${k}`}>{label}</label>
      <input id={`b-${k}`} type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="sm-sheet" onClick={onClose}>
      <div className="sm-sheet-card" onClick={(e) => e.stopPropagation()}>
        {state === "sent" ? (
          <>
            <h3 className="sm-display">{t("b.sent")}</h3>
            <button className="sm-btn sm-btn-block" onClick={onClose}>
              ✕
            </button>
          </>
        ) : (
          <>
            <h3 className="sm-display">{t("b.title")}</h3>
            <p className="sm-muted" style={{ fontSize: "0.9rem" }}>
              {t("b.sub")}
            </p>
            <div className="sm-grid2">
              {field("company", t("b.company"))}
              {field("person", t("b.person"))}
              {field("email", t("b.email"), "email")}
              {field("phone", t("b.phone"))}
              {field("website", t("b.website"))}
              <div>
                <label htmlFor="b-vertical">{t("b.vertical")}</label>
                <select id="b-vertical" value={f.vertical} onChange={(e) => set("vertical", e.target.value)}>
                  {VERTICALS.map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="b-size">{t("b.size")}</label>
                <select
                  id="b-size"
                  value={f.catalogue_size}
                  onChange={(e) => set("catalogue_size", e.target.value)}
                >
                  {["", "1–50", "50–500", "500–5000", "5000+"].map((v) => (
                    <option key={v} value={v}>
                      {v || "—"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="b-plan">{t("b.plan")}</label>
                <select id="b-plan" value={f.plan} onChange={(e) => set("plan", e.target.value)}>
                  {["", "starter", "professional", "business", "enterprise"].map((v) => (
                    <option key={v} value={v}>
                      {v || "—"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="b-msg">{t("b.msg")}</label>
              <textarea id="b-msg" rows={3} value={f.message} onChange={(e) => set("message", e.target.value)} />
            </div>
            {state === "bad" && <p className="sm-err">{t("b.bad")}</p>}
            <button
              className="sm-btn sm-btn-accent sm-btn-block"
              onClick={submit}
              disabled={state === "sending"}
            >
              {t("b.send")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
