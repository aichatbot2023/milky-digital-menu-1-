/**
 * TRENUTAK OTKRIVANJA — roditelj vidi SVOJU sobu, i sve što je AI u njoj našao.
 *
 * Ovo je nedostajalo. Roditelj slika celu kuhinju, aplikacija u njoj nađe
 * sedam opasnosti — a prvo što je do sada video bio je isečak jednog predmeta,
 * veličine palca. Sav rad se dešavao, ali se nigde nije VIDEO. Otud utisak da
 * je aplikacija oslabila baš kad je postala temeljnija: nije imala trenutak u
 * kome pokaže šta zna.
 *
 * Zato ekran radi tačno tri stvari, i ništa više:
 *   1. pokazuje celu fotografiju, ne isečak — to je NJEGOVA soba;
 *   2. pušta nalaze da iskaču jedan po jedan, od najopasnijeg naniže, dok
 *      brojač raste — pauza između njih je ono što se oseti kao „koliko toga";
 *   3. tek onda nudi da se krene redom.
 *
 * Redosled nije ukras. Prvo iskače ono što može da povredi danas, pa se
 * spušta ka sitnicama; roditelj tako pamti prvo ono najvažnije. A nesigurni
 * nalazi nose upitnik i stoje na kraju — jer je ovde bolje reći „vidim nešto,
 * proveri" nego prećutati.
 */
import { useEffect, useState } from "react";
import type { AgeGroup, Hazard } from "../types";
import { SEVERITY_META } from "../types";
import { CATEGORY_ICONS, hazardName, severityLabel, t } from "../lib/i18n";
import { rankHazards } from "../lib/priority";

interface Props {
  imageUrl: string;
  hazards: Hazard[];
  ageGroup: AgeGroup;
  safetyScore: number;
  onContinue: () => void;
}

/** Razmak između dva iskakanja. Dovoljno da se svako primeti pojedinačno. */
const STEP_MS = 420;

export function RoomReveal({ imageUrl, hazards, ageGroup, safetyScore, onContinue }: Props) {
  const ranked = rankHazards(hazards, ageGroup);
  const [shown, setShown] = useState(0);
  const done = shown >= ranked.length;

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => {
      setShown((n) => n + 1);
      // Kratak dodir na svaki nalaz: opasnost se i oseti, ne samo vidi.
      // Jači na ono što stvarno može da povredi.
      try {
        const sev = ranked[shown]?.severity;
        (navigator as any).vibrate?.(sev === "critical" ? 55 : sev === "high" ? 35 : 18);
      } catch {
        /* ignoriši */
      }
    }, shown === 0 ? 500 : STEP_MS);
    return () => clearTimeout(id);
  }, [shown, done, ranked]);

  // Nestrpljivom roditelju dodir preskače animaciju — čekanje ne sme da bude
  // obavezno, koliko god lepo izgledalo.
  const skip = () => setShown(ranked.length);

  return (
    <div className="reveal" onClick={done ? undefined : skip}>
      <div className="reveal-photo">
        <img src={imageUrl} alt="" className="reveal-img" />
        {ranked.slice(0, shown).map((h, i) => (
          <div
            key={h.id}
            className={`reveal-box${h.uncertain ? " reveal-box-maybe" : ""}`}
            style={{
              left: `${h.box.x * 100}%`,
              top: `${h.box.y * 100}%`,
              width: `${h.box.w * 100}%`,
              height: `${h.box.h * 100}%`,
              borderColor: SEVERITY_META[h.severity].color,
              ["--sev" as string]: SEVERITY_META[h.severity].color,
            }}
          >
            <span className="reveal-pin" style={{ background: SEVERITY_META[h.severity].color }}>
              {h.uncertain ? "?" : i + 1}
            </span>
            {i === shown - 1 && (
              <span className="reveal-name">
                {CATEGORY_ICONS[h.category]} {hazardName(h)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="reveal-bar">
        <div className="reveal-count">
          <b>{shown}</b>
          <span>
            {ranked.length === 1 ? t("reveal.one") : t("reveal.many")}
          </span>
        </div>
        {done && (
          <div className="reveal-legend">
            {(["critical", "high", "medium", "low"] as const)
              .map((sev) => ({ sev, n: ranked.filter((h) => h.severity === sev).length }))
              .filter((x) => x.n > 0)
              .map((x) => (
                <span key={x.sev} className="reveal-chip">
                  <i style={{ background: SEVERITY_META[x.sev].color }} />
                  {x.n} {severityLabel(x.sev).toLowerCase()}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="reveal-actions">
        {done ? (
          <button className="btn btn-primary reveal-go" onClick={onContinue}>
            {t("reveal.go")}
          </button>
        ) : (
          <p className="reveal-hint">{t("reveal.looking")}</p>
        )}
        <span className="reveal-score" data-level={safetyScore >= 70 ? "ok" : safetyScore >= 40 ? "mid" : "bad"}>
          {safetyScore}/100
        </span>
      </div>
    </div>
  );
}
