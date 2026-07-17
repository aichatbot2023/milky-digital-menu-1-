import type { ScanRecord } from "../types";
import { ROOM_LABELS } from "../types";

interface Props {
  scans: ScanRecord[];
  onOpen: (scan: ScanRecord) => void;
  onDelete: (id: string) => void;
}

export function ScanHistory({ scans, onOpen, onDelete }: Props) {
  if (scans.length === 0) return null;
  return (
    <div className="history">
      <h3>Prethodna skeniranja</h3>
      <div className="history-list">
        {scans.map((s) => {
          const unresolved = s.result.hazards.filter((h) => !h.resolved).length;
          return (
            <div key={s.id} className="history-item" onClick={() => onOpen(s)}>
              <img src={s.imageDataUrl} alt="" />
              <div className="history-info">
                <strong>{ROOM_LABELS[s.roomType]}</strong>
                <span className="muted">
                  {new Date(s.createdAt).toLocaleDateString("sr-RS")} · skor{" "}
                  {s.result.safety_score}/100
                </span>
                <span className={unresolved > 0 ? "warn" : "ok"}>
                  {unresolved > 0 ? `${unresolved} nerešeno` : "Sve rešeno ✓"}
                </span>
              </div>
              <button
                className="history-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                aria-label="Obriši sken"
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
