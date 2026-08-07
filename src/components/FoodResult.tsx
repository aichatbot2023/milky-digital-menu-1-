import type { FoodAnalysis } from "../lib/food";
import { VERDICT_META } from "../lib/food";
import { t } from "../lib/i18n";

interface Props {
  image: string;
  result: FoodAnalysis | null;
  /** Offline smernice kada AI analiza slike nije dostupna. */
  offlineGuidance: string[] | null;
  ageLabel: string;
  onAgain: () => void;
  onBack: () => void;
}

export function FoodResult({ image, result, offlineGuidance, ageLabel, onAgain, onBack }: Props) {
  return (
    <div className="app">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          {t("back")}
        </button>
        {result && (
          <span
            className="badge"
            style={{ background: VERDICT_META[result.verdict].color }}
          >
            {t(`food.${result.verdict}`)}
          </span>
        )}
      </header>

      <div className="overlay-wrap">
        <img src={image} alt="Skenirana hrana" className="overlay-img" />
      </div>

      {result ? (
        <>
          <h2>🍽️ {result.food_name}</h2>
          <p className="muted">{t("food.forAge")} {ageLabel}</p>
          <p className="summary">{result.summary}</p>

          {result.choking && (
            <div className="food-warn">
              <strong>{t("food.choking")}</strong>
              <p>{result.choking}</p>
            </div>
          )}

          {result.allergens.length > 0 && (
            <div className="food-block">
              <h3>{t("food.allergens")}</h3>
              <div className="profile-chips">
                {result.allergens.map((a) => (
                  <span key={a} className="chip food-allergen">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.items.length > 0 && (
            <div className="food-block">
              <h3>{t("food.items")}</h3>
              <div className="hazard-list">
                {result.items.map((it, i) => (
                  <div key={i} className="hazard-row food-item">
                    <span
                      className="food-dot"
                      style={{ background: VERDICT_META[it.status].color }}
                    />
                    <span className="food-item-body">
                      <strong>{it.name}</strong>
                      <span className="muted">{it.why}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.prep_tip && (
            <div className="food-block food-tip">
              <h3>{t("food.prep")}</h3>
              <p>{result.prep_tip}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <h2>{t("food.guidelines")} {ageLabel}</h2>
          <p className="warn">{t("food.offline")}</p>
          <div className="hazard-list">
            {(offlineGuidance ?? []).map((g, i) => (
              <div key={i} className="hazard-row food-item">
                <span className="food-dot" style={{ background: "#0f766e" }} />
                <span className="food-item-body">{g}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sheet-actions">
        <button className="btn btn-primary" onClick={onAgain}>
          {t("food.again")}
        </button>
        <button className="btn btn-outline" onClick={onBack}>
          {t("home")}
        </button>
      </div>

      <footer className="disclaimer">
        {t("food.disclaimer")}
      </footer>
    </div>
  );
}
