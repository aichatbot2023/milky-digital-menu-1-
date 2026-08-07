import { useEffect, useState } from "react";
import type { Hazard } from "../types";
import { SEVERITY_META } from "../types";
import { categoryLabel, hazardName, severityLabel, t } from "../lib/i18n";
import { recordFeedback } from "../lib/learning";
import { contribute } from "../lib/contribute";
import {
  openProduct,
  productsForCategory,
  productTitle,
  recsEnabled,
  setRecsEnabled,
  type PartnerProduct,
} from "../lib/products";

interface Props {
  hazard: Hazard;
  onClose: () => void;
  onToggleResolved: (id: string) => void;
  /**
   * Fotografija na kojoj je nalaz uočen. Potrebna je samo da bi se, uz
   * izričit pristanak, poslao ISEČAK ovog predmeta kao primer za učenje.
   * Bez pristanka se ne koristi ni za šta.
   */
  imageDataUrl?: string;
}

export function HazardDetailSheet({ hazard, onClose, onToggleResolved, imageDataUrl }: Props) {
  const meta = SEVERITY_META[hazard.severity];
  const [voted, setVoted] = useState<null | "up" | "down">(null);
  const [products, setProducts] = useState<PartnerProduct[]>([]);
  const [recsOn, setRecsOn] = useState(() => recsEnabled());

  // Partnerski proizvodi koji rešavaju OVU kategoriju opasnosti
  useEffect(() => {
    let alive = true;
    if (recsOn) {
      productsForCategory(hazard.category).then((p) => alive && setProducts(p));
    } else {
      setProducts([]);
    }
    return () => {
      alive = false;
    };
  }, [hazard.category, recsOn]);

  const toggleRecs = () => {
    const next = !recsOn;
    setRecsEnabled(next);
    setRecsOn(next);
  };

  const vote = (correct: boolean) => {
    if (voted || !hazard.sourceClass) return;
    recordFeedback(hazard.sourceClass, correct);
    setVoted(correct ? "up" : "down");
    // Ista ocena, dva učinka: prag na ovom telefonu se pomera odmah, a sam
    // model se popravlja tek kad se skupi dovoljno ovakvih ispravki. Drugo
    // se dešava samo ako je roditelj na to izričito pristao.
    if (imageDataUrl) void contribute(imageDataUrl, hazard, correct);
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
        <h2>{hazardName(hazard)}</h2>
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

        {recsOn && products.length > 0 && (
          <section className="shop">
            <h3>🛍️ {t("shop.title")}</h3>
            <div className="shop-list">
              {products.map((p) => (
                <button key={p.id} className="shop-item" onClick={() => openProduct(p)}>
                  <span className="shop-brand">{p.brand}</span>
                  <span className="shop-name">{productTitle(p)}</span>
                  <span className="shop-cta">
                    {p.price && <b>{p.price}</b>}
                    {t("shop.view")} →
                  </span>
                </button>
              ))}
            </div>
            <p className="shop-note">{t("shop.note")}</p>
            <button className="shop-toggle" onClick={toggleRecs}>
              {t("shop.hide")}
            </button>
          </section>
        )}
        {!recsOn && (
          <button className="shop-toggle" onClick={toggleRecs}>
            🛍️ {t("shop.show")}
          </button>
        )}

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
