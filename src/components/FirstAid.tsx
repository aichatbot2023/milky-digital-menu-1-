import { useState } from "react";
import { t } from "../lib/i18n";
import { getFirstAidTopics } from "../lib/guides";

interface Props {
  onBack: () => void;
}

// Prva pomoć za decu — offline vodiči korak po korak
export function FirstAid({ onBack }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const topics = getFirstAidTopics();

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          {t("back")}
        </button>
      </header>

      <h2>{t("fa.title")}</h2>
      <div className="food-warn">
        <p>{t("fa.warning")}</p>
      </div>

      <div className="hazard-list">
        {topics.map((topic) => (
          <div key={topic.id} className="fa-topic">
            <button
              className="hazard-row fa-head"
              onClick={() => setOpenId(openId === topic.id ? null : topic.id)}
            >
              <span className="fa-icon">{topic.icon}</span>
              <span className="hazard-row-label">{topic.title}</span>
              <span className="fa-arrow">{openId === topic.id ? "▲" : "▼"}</span>
            </button>
            {openId === topic.id && (
              <ol className="fa-steps">
                {topic.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
