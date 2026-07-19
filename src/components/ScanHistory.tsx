import type { ScanRecord } from "../types";
import { roomLabel, t } from "../lib/i18n";

interface Props {
  scans: ScanRecord[];
  onOpen: (scan: ScanRecord) => void;
  onDelete: (id: string) => void;
}

export function ScanHistory({ scans, onOpen, onDelete }: Props) {
  if (scans.length === 0) return null;
  return (
    <div className="history">
      <h3>{t("history.title")}</h3>
      <div className="history-list">
        {scans.map((s) => {
          const unresolved = s.result.hazards.filter((h) => !h.resolved).length;
          return (
            <div key={s.id} className="history-item" onClick={() => onOpen(s)}>
              <img src={s.imageDataUrl} alt="" />
              <div className="history-info">
                <strong>{roomLabel(s.roomType)}</strong>
                <span className="muted">
                  {new Date(s.createdAt).toLocaleDateString()} · {t("history.score")}{" "}
                  {s.result.safety_score}/100
                </span>
                <span className={unresolved > 0 ? "warn" : "ok"}>
                  {unresolved > 0 ? `${unresolved} ${t("history.unresolved")}` : t("history.resolved")}
                </span>
              </div>
              <button
                className="history-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                aria-label={t("history.delete")}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
