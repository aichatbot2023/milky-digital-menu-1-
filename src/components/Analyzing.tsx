import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { Logo } from "./Logo";

interface Props {
  /** Sličica kadra koji se analizira — korisnik vidi šta AI gleda. */
  imageDataUrl?: string | null;
  /** Koraci koji se „štrikliraju" redom (već lokalizovani). */
  steps: string[];
  title: string;
}

/**
 * Ekran analize: ne prikazuje boxeve ni sirove detekcije, nego OSEĆAJ
 * inteligencije — koraci koji se završavaju i progres do 100%.
 */
export function Analyzing({ imageDataUrl, steps, title }: Props) {
  const [done, setDone] = useState(0);
  const [pct, setPct] = useState(6);

  useEffect(() => {
    // Koraci se pale ravnomerno; progres asimptotski juri ka 95% dok
    // pravi odgovor ne stigne (nikad ne "laže" da je gotovo)
    const stepId = setInterval(
      () => setDone((d) => Math.min(steps.length - 1, d + 1)),
      900,
    );
    const pctId = setInterval(
      () => setPct((p) => (p >= 95 ? 95 : p + Math.max(1, Math.round((95 - p) / 12)))),
      160,
    );
    return () => {
      clearInterval(stepId);
      clearInterval(pctId);
    };
  }, [steps.length]);

  return (
    <div className="analyzing">
      <div className="analyzing-visual">
        {imageDataUrl && <img src={imageDataUrl} alt="" className="analyzing-img" />}
        <div className="analyzing-ring">
          <svg viewBox="0 0 120 120">
            <circle className="ring-bg" cx="60" cy="60" r="52" />
            <circle
              className="ring-fg"
              cx="60"
              cy="60"
              r="52"
              style={{ strokeDashoffset: 327 - (327 * pct) / 100 }}
            />
          </svg>
          <span className="analyzing-pct">{pct}%</span>
        </div>
      </div>

      <h2 className="analyzing-title">{title}</h2>

      <ul className="analyzing-steps">
        {steps.map((s, i) => (
          <li key={s} className={i <= done ? "step-done" : ""}>
            <span className="step-mark">{i < done ? "✓" : i === done ? "◔" : "○"}</span>
            {s}
          </li>
        ))}
      </ul>

      <p className="analyzing-note">{t("analyzing.note")}</p>

      <div className="analyzing-brand">
        <Logo size={46} wordmark light />
      </div>
    </div>
  );
}
