import type { Hazard } from "../types";
import { SEVERITY_META } from "../types";
import { hazardName } from "../lib/i18n";

interface Props {
  imageUrl: string;
  hazards: Hazard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Slika sa markerima opasnosti; bounding box-ovi su normalizovani 0-1
export function HazardOverlay({ imageUrl, hazards, selectedId, onSelect }: Props) {
  return (
    <div className="overlay-wrap">
      <img src={imageUrl} alt="Skenirani prostor" className="overlay-img" />
      {hazards.map((h, i) => {
        const meta = SEVERITY_META[h.severity];
        const selected = h.id === selectedId;
        return (
          <button
            key={h.id}
            className={`hazard-box${selected ? " selected" : ""}${h.resolved ? " resolved" : ""}`}
            style={{
              left: `${h.box.x * 100}%`,
              top: `${h.box.y * 100}%`,
              width: `${h.box.w * 100}%`,
              height: `${h.box.h * 100}%`,
              borderColor: meta.color,
            }}
            onClick={() => onSelect(h.id)}
            aria-label={`${meta.label}: ${hazardName(h)}`}
          >
            <span className="hazard-pin" style={{ background: meta.color }}>
              {h.resolved ? "✓" : i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
