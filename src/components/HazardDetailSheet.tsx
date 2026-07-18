import { useState } from "react";
import type { Hazard } from "../types";
import { CATEGORY_LABELS, SEVERITY_META } from "../types";
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
            {meta.label}
          </span>
          <span className="badge badge-cat">{CATEGORY_LABELS[hazard.category]}</span>
        </div>
        <h2>{hazard.label}</h2>

        <section>
          <h3>⚠️ Zašto je opasno</h3>
          <p>{hazard.why}</p>
        </section>

        <section>
          <h3>📊 Statistika povreda</h3>
          <p>{hazard.stats}</p>
        </section>

        <section>
          <h3>✅ Kako rešiti</h3>
          <p>{hazard.fix}</p>
        </section>

        {hazard.sourceClass && (
          <section className="feedback">
            <h3>🧠 Da li je AI pogodio?</h3>
            {voted ? (
              <p className="ok">
                Hvala! Aplikacija uči iz vaše ocene i sledeći put će biti preciznija.
              </p>
            ) : (
              <div className="feedback-row">
                <button className="btn btn-outline" onClick={() => vote(true)}>
                  👍 Tačno, opasnost
                </button>
                <button className="btn btn-outline" onClick={() => vote(false)}>
                  👎 Nije opasnost
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
            {hazard.resolved ? "Vrati kao nerešeno" : "Označi kao rešeno"}
          </button>
          <button className="btn btn-outline" onClick={onClose}>
            Zatvori
          </button>
        </div>
      </div>
    </div>
  );
}
