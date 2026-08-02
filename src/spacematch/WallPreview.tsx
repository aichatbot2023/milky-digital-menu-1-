import { useEffect, useRef, useState } from "react";
import { t } from "./i18n";
import type { Match, RoomProfile } from "./api";

interface Props {
  room: string;
  piece: Match;
  profile: RoomProfile;
}

const FRAMES = [
  { id: "thin", cls: "sm-piece-thin", label: "Slim white" },
  { id: "wide", cls: "sm-piece-wide", label: "Wide white" },
  { id: "dark", cls: "sm-piece-dark", label: "Dark" },
  { id: "none", cls: "", label: "None" },
] as const;

/**
 * Pregled komada na kupčevom zidu. Namerno bez WebXR-a i bez biblioteka:
 * fotografija + razmera izračunata iz procenjene širine zida daje realan
 * osećaj veličine na svakom telefonu, bez ijedne dozvole i bez čekanja.
 */
export function WallPreview({ room, piece, profile }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<(typeof FRAMES)[number]["id"]>("thin");
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: profile.focalPoint.x + profile.focalPoint.w / 2, y: profile.focalPoint.y + profile.focalPoint.h / 2 });
  const drag = useRef<{ active: boolean }>({ active: false });

  // Prava razmera: širina komada / procenjena širina zida u kadru.
  const pieceW = Number(piece.width_cm) || 90;
  const pieceH = Number(piece.height_cm) || 120;
  const wallW = profile.wallWidth || 300;
  const widthPct = Math.max(4, Math.min(96, (pieceW / wallW) * 100 * scale));
  const aspect = pieceH / pieceW;

  useEffect(() => {
    setPos({ x: profile.focalPoint.x + profile.focalPoint.w / 2, y: profile.focalPoint.y + profile.focalPoint.h / 2 });
    setScale(1);
  }, [piece.id, profile.focalPoint.x, profile.focalPoint.y, profile.focalPoint.w, profile.focalPoint.h]);

  const move = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(0.03, Math.min(0.97, (clientX - r.left) / r.width)),
      y: Math.max(0.03, Math.min(0.97, (clientY - r.top) / r.height)),
    });
  };

  return (
    <div className="sm-rise">
      <div
        className="sm-preview"
        ref={wrapRef}
        onPointerDown={(e) => {
          drag.current.active = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => drag.current.active && move(e.clientX, e.clientY)}
        onPointerUp={() => (drag.current.active = false)}
        onPointerCancel={() => (drag.current.active = false)}
      >
        <img src={room} alt="" className="sm-room" />
        <div
          className={`sm-piece ${FRAMES.find((f) => f.id === frame)!.cls}`}
          style={{
            width: `${widthPct}%`,
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          {piece.image_url ? (
            <img src={piece.image_url} alt="" style={{ aspectRatio: `1 / ${aspect}` }} />
          ) : (
            <div style={{ aspectRatio: `1 / ${aspect}`, background: "#cbd5e1" }} />
          )}
        </div>
      </div>

      <div className="sm-preview-bar">
        <span className="sm-fact" style={{ padding: "7px 12px", borderRadius: 999 }}>
          {t("s.frame")}
        </span>
        {FRAMES.map((f) => (
          <button
            key={f.id}
            className={`sm-chip${frame === f.id ? " sm-chip-on" : ""}`}
            onClick={() => setFrame(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="sm-preview-bar">
        <span className="sm-fact" style={{ padding: "7px 12px", borderRadius: 999 }}>
          {t("s.scale")}
        </span>
        <input
          type="range"
          min={0.5}
          max={1.8}
          step={0.02}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          style={{ flex: 1, minWidth: 140, padding: 0, border: "none", background: "none" }}
          aria-label={t("s.scale")}
        />
        <b style={{ fontSize: "0.85rem" }}>
          {Math.round(pieceW * scale)} × {Math.round(pieceH * scale)} cm
        </b>
      </div>

      <p className="sm-preview-hint">
        {t("s.wall")}: ~{Math.round(wallW)} cm · {t("s.drag")}
      </p>
    </div>
  );
}
