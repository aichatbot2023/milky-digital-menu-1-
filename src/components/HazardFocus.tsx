import { useEffect, useMemo, useRef, useState } from "react";
import type { AgeGroup, Hazard } from "../types";
import { SEVERITY_META } from "../types";
import { severityLabel, t } from "../lib/i18n";
import { recordFeedback } from "../lib/learning";
import { Burst } from "./Burst";
import { daysSince } from "../lib/memory";
import { factsFor, liveScore, rankHazards, stepsFor, type RankedHazard } from "../lib/priority";
import {
  openRecommendation,
  recommendationsFor,
  type Recommendation,
} from "../lib/products";

interface Props {
  imageDataUrl: string;
  hazards: Hazard[];
  baseScore: number;
  ageGroup: AgeGroup;
  onToggleResolved: (id: string) => void;
  onBack: () => void;
  onShare: () => void;
}

/** Iseca deo fotografije oko opasnosti — fotografija je najvažniji element. */
function useCrop(imageDataUrl: string, box: Hazard["box"]): string | null {
  const [crop, setCrop] = useState<string | null>(null);
  const key = `${box.x},${box.y},${box.w},${box.h}`;
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      // Malo šireg konteksta oko predmeta (30% margine) da se vidi okolina
      const padX = box.w * 0.3;
      const padY = box.h * 0.3;
      const sx = Math.max(0, (box.x - padX) * img.width);
      const sy = Math.max(0, (box.y - padY) * img.height);
      const sw = Math.min(img.width - sx, (box.w + padX * 2) * img.width);
      const sh = Math.min(img.height - sy, (box.h + padY * 2) * img.height);
      if (sw < 4 || sh < 4) {
        if (alive) setCrop(imageDataUrl);
        return;
      }
      const c = document.createElement("canvas");
      const side = 420;
      c.width = side;
      c.height = side;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      // Kvadratni „cover" isečak
      const scale = Math.max(side / sw, side / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.drawImage(img, sx, sy, sw, sh, (side - dw) / 2, (side - dh) / 2, dw, dh);
      if (alive) setCrop(c.toDataURL("image/jpeg", 0.86));
    };
    img.src = imageDataUrl;
    return () => {
      alive = false;
    };
  }, [imageDataUrl, key, box.x, box.y, box.w, box.h]);
  return crop;
}

function FocusCard({
  h,
  index,
  total,
  imageDataUrl,
  onFixed,
}: {
  h: RankedHazard;
  index: number;
  total: number;
  imageDataUrl: string;
  onFixed: () => void;
}) {
  const meta = SEVERITY_META[h.severity];
  const crop = useCrop(imageDataUrl, h.box);
  const facts = useMemo(() => factsFor(h), [h]);
  const steps = useMemo(() => stepsFor(h), [h]);
  const [products, setProducts] = useState<Recommendation[]>([]);
  const [showShop, setShowShop] = useState(false);
  const [voted, setVoted] = useState(false);
  /** Broj potvrda — svaka pokreće novu eksploziju čestica. */
  const [burst, setBurst] = useState(0);

  // Preporuke se vezuju za KONKRETAN predmet (rešenje koje AI predloži),
  // ne za široku kategoriju — vrela kafa traži šolju, ne zaštitu šporeta
  useEffect(() => {
    let alive = true;
    recommendationsFor(h).then((r) => alive && setProducts(r));
    return () => {
      alive = false;
    };
  }, [h.id, h.solution, h.sourceClass, h.category]);

  return (
    <article className="focus-card stagger">
      <div className="focus-photo">
        {crop ? <img src={crop} alt={h.label} /> : <div className="focus-photo-skel" />}
        <span className="focus-risk" style={{ background: meta.color }}>
          {severityLabel(h.severity)}
        </span>
      </div>

      <p className="focus-priority">
        {t("focus.priority")} {index + 1} {t("focus.of")} {total}
      </p>

      {/* Memorija: ista opasnost prepoznata iz ranijih skenova */}
      {(h.timesSeen ?? 1) > 1 && (
        <p className="focus-memory">
          🔁 {t("mem.seen")} {h.timesSeen}× ·{" "}
          {h.firstSeenAt && daysSince(h.firstSeenAt) > 0
            ? `${t("mem.unresolvedDays")} ${daysSince(h.firstSeenAt)} ${t("mem.days")}`
            : t("mem.since")}
          {h.recognitionUncertain && ` · ${t("mem.uncertain")}`}
        </p>
      )}
      <h2 className="focus-title">
        {h.label}
        {h.count > 1 && <span className="focus-count">×{h.count}</span>}
      </h2>
      <p className="focus-desc">{h.why}</p>

      {steps.length > 0 && (
        <section className="focus-block focus-do">
          <h3>{t("focus.do")}</h3>
          <ul>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {facts.length > 0 && (
        <section className="focus-block">
          <h3>{t("focus.why")}</h3>
          <ul className="focus-facts">
            {facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {products.length > 0 && (
        <section className="focus-block">
          {!showShop ? (
            <button className="btn btn-outline btn-alt" onClick={() => setShowShop(true)}>
              🛡️ {t("focus.saferBtn")}
            </button>
          ) : (
            <>
              <h3>{t("focus.safer")}</h3>
              <div className="alt-list snap-row">
                {products.map((p) => (
                  <button
                    key={p.key}
                    className={`alt-item${p.isSearch ? " alt-search" : ""}`}
                    onClick={() => openRecommendation(p)}
                  >
                    <span className="alt-brand">{p.brand}</span>
                    <span className="alt-name">
                      {p.isSearch ? `${t("focus.searchFor")} „${p.title}"` : p.title}
                    </span>
                    <span className="alt-foot">
                      {p.price && <b>{p.price}</b>}
                      <span className="alt-cta">{t("focus.view")} →</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="alt-note">{t("shop.note")}</p>
            </>
          )}
        </section>
      )}

      <div className="fixed-wrap">
        <Burst trigger={burst} />
        <button
          className={`btn btn-primary btn-fixed${burst > 0 ? " flash" : ""}`}
          onClick={() => {
            setBurst((b) => b + 1);
            onFixed();
          }}
        >
          ✓ {t("focus.fixed")}
        </button>
      </div>

      {/* Samoučenje: diskretno, ne odvlači pažnju sa akcije */}
      {h.sourceClass && (
        <div className="focus-fb">
          {voted ? (
            <span className="ok">{t("sheet.fb.thanks")}</span>
          ) : (
            <button
              onClick={() => {
                recordFeedback(h.sourceClass!, false);
                setVoted(true);
              }}
            >
              {t("focus.wrong")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Ekran rezultata: JEDNA opasnost u fokusu, po prioritetu rizika.
 * „Rešeno" → kartica odlazi ulevo, skor raste, dolazi sledeća.
 */
export function HazardFocus({
  imageDataUrl,
  hazards,
  baseScore,
  ageGroup,
  onToggleResolved,
  onBack,
  onShare,
}: Props) {
  const ranked = useMemo(() => rankHazards(hazards, ageGroup), [hazards, ageGroup]);
  const open = ranked.filter((h) => !h.resolved);
  const score = liveScore(baseScore, ranked);
  const [leaving, setLeaving] = useState(false);
  const prevScore = useRef(score);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (score > prevScore.current) {
      setBump(true);
      const id = setTimeout(() => setBump(false), 700);
      prevScore.current = score;
      return () => clearTimeout(id);
    }
    prevScore.current = score;
  }, [score]);

  const current = open[0] ?? null;
  const doneCount = ranked.length - open.length;

  const markFixed = (h: RankedHazard) => {
    setLeaving(true);
    setTimeout(() => {
      // Cela grupa se rešava odjednom (5 istih ivica = jedan potez)
      for (const raw of hazards) {
        if (raw.category === h.category && raw.label === h.label && !raw.resolved) {
          onToggleResolved(raw.id);
        }
      }
      setLeaving(false);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 260);
  };

  return (
    <div className="app focus-app">
      <header className="focus-top">
        <button className="focus-back" onClick={onBack} aria-label={t("back")}>
          ←
        </button>
        <div className="focus-progress">
          <div className={`focus-score${bump ? " focus-score-up" : ""}`}>
            <b>{score}</b>
            <span>/100</span>
          </div>
          <div className="focus-bar">
            <div className="focus-bar-fill" style={{ width: `${score}%` }} />
          </div>
          <p className="focus-remaining">
            {open.length > 0
              ? `${t("focus.remaining")} ${open.length}`
              : t("focus.allClear")}
            {doneCount > 0 && ` · ${doneCount} ${t("focus.fixedCount")}`}
          </p>
        </div>
        <button className="focus-back" onClick={onShare} aria-label={t("share.btn")}>
          ↗
        </button>
      </header>

      {current ? (
        <div className={`focus-stage${leaving ? " focus-leaving" : ""}`} key={current.id}>
          <FocusCard
            h={current}
            index={doneCount}
            total={ranked.length}
            imageDataUrl={imageDataUrl}
            onFixed={() => markFixed(current)}
          />
        </div>
      ) : (
        <div className="focus-done">
          <div className="focus-done-emoji">🛡️</div>
          <h2>{t("focus.doneTitle")}</h2>
          <p className="muted">{t("focus.doneSub")}</p>
          <button className="btn btn-primary" onClick={onBack}>
            {t("focus.newScan")}
          </button>
          <button className="btn btn-outline" onClick={onShare}>
            {t("share.btn")}
          </button>
        </div>
      )}

      {open.length > 1 && (
        <p className="focus-next">
          {t("focus.next")}: <b>{open[1].label}</b>
        </p>
      )}
    </div>
  );
}
