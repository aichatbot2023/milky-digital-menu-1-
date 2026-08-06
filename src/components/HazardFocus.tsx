import { useEffect, useMemo, useRef, useState } from "react";
import type { AgeGroup, Hazard } from "../types";
import { SEVERITY_META } from "../types";
import { hazardName, severityLabel, t } from "../lib/i18n";
import { recordFeedback } from "../lib/learning";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Burst } from "./Burst";
import { daysSince } from "../lib/memory";
import { factsFor, liveScore, rankHazards, stepsFor, type RankedHazard } from "../lib/priority";
import {
  openRecommendation,
  recommendationsFor,
  type Recommendation,
} from "../lib/products";
import { InPlace } from "./InPlace";

interface Props {
  imageDataUrl: string;
  /** Pre koliko dana je ovaj isti prostor već skeniran; null = prvi put. */
  roomSeen?: number | null;
  hazards: Hazard[];
  baseScore: number;
  ageGroup: AgeGroup;
  onToggleResolved: (id: string) => void;
  onBack: () => void;
  onShare: () => void;
  /**
   * Kartica procene cele prostorije. Stiže spolja da bi `HazardFocus` ostao
   * ono što jeste — prikaz jednog nalaza — a ne i mesto koje zna za uglove.
   */
  roomAssess?: React.ReactNode;
}

/**
 * Isečak fotografije oko opasnosti.
 *
 * Fotografija je najvažniji element ovog ekrana: roditelj po njoj prepoznaje
 * SVOJ predmet. Prva verzija ga je pretvarala u mrlju iz dva razloga
 * odjednom, i oba su morala da se poprave:
 *
 * 1. Prozor je bio samo opasnost + 30 % okvira. Utičnica zauzima 5 % kadra,
 *    pa je isečak bio 5 % slike razvučeno preko cele kartice — bez ijednog
 *    prepoznatljivog detalja okolo. Sada prozor nikad nije uži od
 *    `MIN_WINDOW` kraće strane fotografije, pa se uvek vidi i okolina.
 * 2. Platno je bilo 420 px, a kartica ga prikazuje preko 1200 px na gustom
 *    ekranu — dakle još tri puta uvećano posle svega. Sada platno prati
 *    izvor, do `MAX_SIDE`.
 */
/** Najmanji prozor isečka, u odnosu na kraću stranu fotografije. */
const MIN_WINDOW = 0.3;
/** Preko ovoga isečak samo teži, ne i jasniji. */
const MAX_SIDE = 900;

function useCrop(imageDataUrl: string, box: Hazard["box"]): string | null {
  const [crop, setCrop] = useState<string | null>(null);
  const key = `${box.x},${box.y},${box.w},${box.h}`;
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      // Kvadratni prozor oko središta opasnosti: dovoljno širok da se vidi
      // gde je to u sobi, a nikad uži od `MIN_WINDOW` kraće strane.
      const floor = Math.min(img.width, img.height) * MIN_WINDOW;
      const want = Math.max(floor, box.w * img.width * 1.6, box.h * img.height * 1.6);
      const win = Math.min(want, img.width, img.height);
      const cxPx = (box.x + box.w / 2) * img.width;
      const cyPx = (box.y + box.h / 2) * img.height;
      const sx = Math.max(0, Math.min(img.width - win, cxPx - win / 2));
      const sy = Math.max(0, Math.min(img.height - win, cyPx - win / 2));
      const sw = win;
      const sh = win;
      if (sw < 4 || sh < 4) {
        if (alive) setCrop(imageDataUrl);
        return;
      }
      const c = document.createElement("canvas");
      // Platno prati izvor: uvećavanje iznad njega ne donosi nijedan detalj,
      // samo mutninu i veći fajl.
      const side = Math.round(Math.max(320, Math.min(MAX_SIDE, win)));
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
        {crop ? <img src={crop} alt={hazardName(h)} /> : <div className="focus-photo-skel" />}
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
        {hazardName(h)}
        {h.count > 1 && <span className="focus-count">×{h.count}</span>}
      </h2>
      {/* Zašto baš OVDE — jedino što lokalni nalaz zna, a ne vidi se iz
          naziva: da li je predmet detetu nadohvat ili stoji na vrelom. */}
      {h.contextNote && <p className="focus-context">📍 {h.contextNote}</p>}
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

      {/* Rešenje na svom mestu: roditelj ne mora da zamišlja kako zaštita
          izgleda kod njega — vidi je na svojoj fotografiji, u pravoj veličini,
          tačno tamo gde je opasnost. Prikazuje se samo kad se predmet zaista
          da izrezati iz svoje fotografije; inače ostaje spisak ispod. */}
      {products[0]?.image && !products[0].isSearch && (
        <section className="focus-block">
          <InPlace
            photo={imageDataUrl}
            hazard={h}
            product={{ title: products[0].title, image_url: products[0].image }}
          />
        </section>
      )}

      {/* Rešenja su UVEK vidljiva — to je odgovor na uočen problem,
          ne reklama koju treba tražiti iza dugmeta. */}
      {products.length > 0 && (
        <section className="focus-block">
          <h3>{t("focus.safer")}</h3>
          <div className="alt-list snap-row">
            {products.map((p) => (
              <button
                key={p.key}
                className={`alt-item${p.isSearch ? " alt-search" : ""}`}
                onClick={() => openRecommendation(p)}
              >
                <span className="alt-thumb" aria-hidden="true">
                  {p.image ? <img src={p.image} alt="" loading="lazy" /> : <Icon name={p.isSearch ? "search" : "cart"} size={22} />}
                </span>
                <span className="alt-text">
                  <span className="alt-brand">{p.brand}</span>
                  <span className="alt-name">
                    {p.isSearch ? `${t("focus.searchFor")} „${p.title}"` : p.title}
                  </span>
                  <span className="alt-foot">
                    {p.price && <b>{p.price}</b>}
                    <span className="alt-cta">{t("focus.view")} →</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="alt-note">{t("shop.note")}</p>
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
          <Icon name="check" size={19} />
          {t("focus.fixed")}
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
  roomSeen,
  hazards,
  baseScore,
  ageGroup,
  onToggleResolved,
  onBack,
  onShare,
  roomAssess,
}: Props) {
  const ranked = useMemo(() => rankHazards(hazards, ageGroup), [hazards, ageGroup]);
  const open = ranked.filter((h) => !h.resolved);
  const score = liveScore(baseScore, ranked);
  const [leaving, setLeaving] = useState(false);
  /** Pregled: jedna po jedna (fokus) ili lista svih nalaza. */
  const [listMode, setListMode] = useState(false);
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
    <>
      {roomSeen !== null && roomSeen !== undefined && (
        <p className="room-known">
          {roomSeen === 0 ? t("room.today") : t("room.days").replace("{n}", String(roomSeen))}
        </p>
      )}
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
        <button
          className={`focus-back${listMode ? " focus-back-on" : ""}`}
          onClick={() => setListMode((v) => !v)}
          aria-label={t(listMode ? "focus.focusMode" : "focus.listMode")}
          title={t(listMode ? "focus.focusMode" : "focus.listMode")}
        >
          {listMode ? "◎" : "☰"}
        </button>
        <button className="focus-back" onClick={onShare} aria-label={t("share.btn")}>
          ↗
        </button>
      </header>

      {listMode ? (
        <div className="focus-list">
          <p className="focus-list-sub">{t("focus.listSub")}</p>
          {ranked.map((h, i) => (
            <button
              key={h.id}
              className={`fl-item${h.resolved ? " fl-done" : ""}`}
              onClick={() => {
                setListMode(false);
                if (!h.resolved) return;
              }}
            >
              <span className="fl-num" style={{ background: SEVERITY_META[h.severity].color }}>
                {h.resolved ? "✓" : i + 1}
              </span>
              <span className="fl-body">
                <span className="fl-top">
                  <b>{hazardName(h)}</b>
                  {h.count > 1 && <span className="fl-count">×{h.count}</span>}
                  <span className="fl-sev" style={{ color: SEVERITY_META[h.severity].color }}>
                    {severityLabel(h.severity)}
                  </span>
                </span>
                <span className="fl-why">{h.why}</span>
                {stepsFor(h)[0] && <span className="fl-fix">→ {stepsFor(h)[0]}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : current ? (
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
          <div className="focus-done-emoji"><Logo size={72} /></div>
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
          {t("focus.next")}: <b>{hazardName(open[1])}</b>
        </p>
      )}

      {/* Posle pojedinačnih nalaza — soba kao celina. Tu roditelj već zna
          šta je nađeno i prirodno se pita „je li to sve". */}
      {roomAssess}
    </div>
    </>
  );
}
