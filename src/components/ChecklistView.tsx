import { useState } from "react";
import type { RoomType } from "../types";
import { ROOM_LABELS } from "../types";
import { roomLabel, t } from "../lib/i18n";
import { checklistProgress, getChecklist, toggleCheck } from "../lib/guides";

interface Props {
  initialRoom: RoomType;
  onBack: () => void;
}

// Check-lista onoga što kamera NE VIDI — po prostoriji, sa trajnim stanjem
export function ChecklistView({ initialRoom, onBack }: Props) {
  const [room, setRoom] = useState<RoomType>(initialRoom);
  const [, force] = useState(0);

  const items = getChecklist(room);
  const { done, total } = checklistProgress(room);

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn btn-ghost" onClick={onBack}>
          {t("back")}
        </button>
        <span className="score" data-level={done === total ? "ok" : done > 0 ? "mid" : "bad"}>
          {done}/{total} {t("check.done")}
        </span>
      </header>

      <h2>{t("check.title")}</h2>
      <p className="muted">{t("check.sub")}</p>

      <div className="profile-chips">
        {(Object.keys(ROOM_LABELS) as RoomType[]).map((r) => {
          const p = checklistProgress(r);
          return (
            <button
              key={r}
              className={`chip${r === room ? " chip-active" : ""}`}
              onClick={() => setRoom(r)}
            >
              {roomLabel(r)} {p.done === p.total ? "✓" : `${p.done}/${p.total}`}
            </button>
          );
        })}
      </div>

      <div className="check-progress">
        <div className="check-progress-fill" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <div className="hazard-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={`hazard-row check-item${item.done ? " check-done" : ""}`}
            onClick={() => {
              toggleCheck(item.id);
              force((n) => n + 1);
            }}
          >
            <span className={`check-box${item.done ? " check-box-on" : ""}`}>
              {item.done ? "✓" : ""}
            </span>
            <span className="check-text">{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
