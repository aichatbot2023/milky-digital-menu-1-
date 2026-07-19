import { useState } from "react";
import type { Hazard } from "../types";
import { SEVERITY_META } from "../types";
import { categoryLabel, severityLabel, t } from "../lib/i18n";
import { recordFeedback } from "../lib/learning";

interface Props {
  hazard: Hazard;
  onClose: () => void;
  onToggleResolved: (id: string) => void;
}

export function HazardDetailSheet({ hazard, onClose, onToggleResolved }: Props) {
  const meta = SEVERITY_META[hazard.severity];
  const [voted, setVoted] = useState<null | "up" | "down">(null);

  const vote = (correct: boolean) => {
    if (voted || !hazard.sourceClass) return;
    recordFeedback(hazard.sourceClass, correct);
    setVoted(correct ? "up" : "down");
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span className="badge" style={{ background: meta.color }}>
            {severityLabel(hazard.severity)}
          </span>
          <span className="badge badge-cat">{categoryLabel(hazard.category)}</span>
        </div>
        <h2>{hazard.label}</h2>
        <p className="sheet-source">
          {hazard.sourceClass
            ? `${t("sheet.srcLocal")}${
                hazard.confidence !== undefined
                  ? ` · ${t("sheet.srcConf")} ${Math.round(hazard.confidence * 100)}%`
                  : ""
              }`
            : t("sheet.srcCloud")}
        </p>

        <section>
          <h3>{t("sheet.why")}</h3>
          <p>{hazard.why}</p>
        </section>

        <section>
          <h3>{t("sheet.stats")}</h3>
          <p>{hazard.stats}</p>
        </section>

        <section>
          <h3>{t("sheet.fix")}</h3>
          <p>{hazard.fix}</p>
        </section>

        {hazard.sourceClass && (
          <section className="feedback">
            <h3>{t("sheet.fb.title")}</h3>
            {voted ? (
              <p className="ok">{t("sheet.fb.thanks")}</p>
            ) : (
              <div className="feedback-row">
                <button className="btn btn-outline" onClick={() => vote(true)}>
                  {t("sheet.fb.yes")}
                </button>
                <button className="btn btn-outline" onClick={() => vote(false)}>
                  {t("sheet.fb.no")}
                </button>
              </div>
            )}
          </section>
        )}

        <div className="sheet-actions">
          <button
            className={hazard.resolved ? "btn btn-outline" : "btn btn-primary"}
            onClick={() => onToggleResolved(hazard.id)}
          >
            {hazard.resolved ? t("sheet.unresolve") : t("sheet.resolve")}
          </button>
          <button className="btn btn-outline" onClick={onClose}>
            {t("paywall.closeBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
