/**
 * Poziv da se soba snimi sa još jedne strane, i sud o njoj kao celini.
 *
 * Stoji na dnu nalaza, posle pojedinačnih opasnosti, jer to je trenutak kad
 * roditelj već zna šta je nađeno i prirodno se pita „a je li to sve". Dok
 * postoji samo jedan ugao, kartica ne obećava ništa — samo objasni zašto
 * drugi ugao vredi. Tek kad ih ima dvoje, ima šta da se kaže.
 */
import { useEffect, useState } from "react";
import type { AgeGroup, RoomType } from "../types";
import { SEVERITY_META } from "../types";
import { t } from "../lib/i18n";
import { anglesFor, assessRoom, type RoomAssessment } from "../lib/room";

interface Props {
  roomType: RoomType;
  ageGroup: AgeGroup;
  /** Pokreni novi sken istog prostora iz drugog ugla. */
  onAnother: () => void;
}

export function RoomAssess({ roomType, ageGroup, onAnother }: Props) {
  const angles = anglesFor(roomType);
  const [res, setRes] = useState<RoomAssessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setRes(null);
    setDone(false);
  }, [roomType, angles.length]);

  const run = async () => {
    setBusy(true);
    const r = await assessRoom(roomType, ageGroup, angles);
    setRes(r);
    setDone(true);
    setBusy(false);
  };

  return (
    <section className="focus-block ra">
      <h3>{t("space.title")}</h3>

      {angles.length < 2 ? (
        <>
          <p className="ra-note">{t("space.needMore")}</p>
          <button className="btn btn-outline ra-btn" onClick={onAnother}>
            {t("space.another")}
          </button>
        </>
      ) : !res ? (
        <>
          <p className="ra-note">
            {t("space.ready1")} {angles.length} {t("space.ready2")}
          </p>
          <div className="ra-actions">
            <button className="btn btn-primary ra-btn" onClick={run} disabled={busy}>
              {busy ? t("space.working") : t("space.assess")}
            </button>
            <button className="btn btn-outline ra-btn" onClick={onAnother}>
              {t("space.another")}
            </button>
          </div>
          {done && !res && <p className="ra-note">{t("space.failed")}</p>}
        </>
      ) : (
        <div className="ra-out">
          <div className="ra-score" data-level={res.room_score >= 70 ? "ok" : res.room_score >= 40 ? "mid" : "bad"}>
            {res.room_score}/100
          </div>
          <p className="ra-verdict">{res.verdict}</p>

          {/* Putevi su ono zbog čega ovo postoji: tri bezopasna predmeta koja
              zajedno čine put do ključale vode. */}
          {res.routes.length > 0 && (
            <div className="ra-routes">
              <h4>{t("space.routes")}</h4>
              {res.routes.map((r, i) => (
                <div key={i} className="ra-route" style={{ borderColor: SEVERITY_META[r.severity]?.color }}>
                  <b>{r.chain}</b>
                  <span>{r.why}</span>
                </div>
              ))}
            </div>
          )}

          {res.repeated.length > 0 && (
            <p className="ra-rep">
              🔁 {t("space.repeated")} {res.repeated.join(", ")}
            </p>
          )}

          {res.unchecked.length > 0 && (
            <div className="ra-todo">
              <h4>{t("space.unchecked")}</h4>
              <ul>
                {res.unchecked.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="ra-start">
            <b>{t("space.start")}</b> {res.start_here}
          </p>
          <button className="btn btn-outline ra-btn" onClick={onAnother}>
            {t("space.another")}
          </button>
        </div>
      )}
    </section>
  );
}
