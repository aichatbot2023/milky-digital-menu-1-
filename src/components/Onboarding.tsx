import { useState } from "react";
import { t } from "../lib/i18n";
import { Icon } from "./Icon";

interface Props {
  onDone: () => void;
}

const ONB_KEY = "safenest.onboarded";

export function onboardingSeen(): boolean {
  try {
    return localStorage.getItem(ONB_KEY) === "1";
  } catch {
    return true; // bez localStorage ne blokiramo ulaz
  }
}

// Vodič kroz 3 koraka — prikazuje se JEDNOM, posle izbora jezika
export function Onboarding({ onDone }: Props) {
  const [step, setStep] = useState(0);

  const slides = [
    { icon: "camera" as const, title: t("onb.1t"), desc: t("onb.1d") },
    { icon: "focus" as const, title: t("onb.2t"), desc: t("onb.2d") },
    { icon: "profile" as const, title: t("onb.3t"), desc: t("onb.3d") },
  ];
  const last = step === slides.length - 1;

  const finish = () => {
    try {
      localStorage.setItem(ONB_KEY, "1");
    } catch {
      /* ignoriši */
    }
    onDone();
  };

  const s = slides[step];
  return (
    <div className="app center onb">
      <div className="onb-icon"><Icon name={s.icon} size={34} /></div>
      <h2>{s.title}</h2>
      <p className="muted onb-desc">{s.desc}</p>
      {step === 1 && (
        <div className="onb-colors">
          <span style={{ background: "#e11d48" }} />
          <span style={{ background: "#f97316" }} />
          <span style={{ background: "#ca8a04" }} />
          <span style={{ background: "#3b82f6" }} />
        </div>
      )}
      <div className="onb-dots">
        {slides.map((_, i) => (
          <span key={i} className={i === step ? "onb-dot onb-dot-on" : "onb-dot"} />
        ))}
      </div>
      <div className="onb-actions">
        {!last && (
          <button className="btn btn-ghost" onClick={finish}>
            {t("onb.skip")}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => (last ? finish() : setStep(step + 1))}
        >
          {last ? t("onb.start") : t("onb.next")}
        </button>
      </div>
    </div>
  );
}
