import { useCallback, useEffect, useRef, useState } from "react";
import type { AgeGroup, AnalysisResult, Hazard, RoomType } from "../types";
import { SEVERITY_META } from "../types";
import { analyzeImage } from "../lib/analyze";
import { HazardDetailSheet } from "./HazardDetailSheet";

interface Props {
  roomType: RoomType;
  ageGroup: AgeGroup;
  childName?: string;
  onClose: () => void;
}

const ANALYZE_INTERVAL_MS = 4000;
const MAX_EDGE = 1024;

// Živi prikaz kamere: svakih ~4s frejm ide na AI analizu, markeri se
// iscrtavaju preko videa. Tap na marker pauzira i otvara detalje.
export function LiveScan({ roomType, ageGroup, childName, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inFlight = useRef(false);
  const pausedRef = useRef(false);

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, []);

  // Pokretanje kamere
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setError(
          "Kamera nije dostupna ili je pristup odbijen. Dozvolite kameru u podešavanjima ili koristite foto mod.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  // Petlja analize
  useEffect(() => {
    const tick = async () => {
      if (inFlight.current || pausedRef.current) return;
      const frame = captureFrame();
      if (!frame) return;
      inFlight.current = true;
      setAnalyzing(true);
      try {
        const res = await analyzeImage({
          imageDataUrl: frame,
          roomType,
          ageGroup,
          childName,
        });
        if (!pausedRef.current) setResult(res);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? "Analiza nije uspela");
      } finally {
        inFlight.current = false;
        setAnalyzing(false);
      }
    };
    const id = setInterval(tick, ANALYZE_INTERVAL_MS);
    // prvi frejm čim se video pokrene
    const startId = setTimeout(tick, 1200);
    return () => {
      clearInterval(id);
      clearTimeout(startId);
    };
  }, [captureFrame, roomType, ageGroup, childName]);

  const pauseOn = (hazard: Hazard) => {
    pausedRef.current = true;
    setPaused(true);
    setFrozenFrame(captureFrame());
    setSelectedHazard(hazard);
  };

  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
    setFrozenFrame(null);
    setSelectedHazard(null);
  };

  const close = () => {
    stopStream();
    onClose();
  };

  const hazards = result?.hazards ?? [];
  const unresolvedCount = hazards.length;

  return (
    <div className="live-wrap">
      <video ref={videoRef} className="live-video" playsInline muted autoPlay />
      {paused && frozenFrame && (
        <img src={frozenFrame} alt="" className="live-video live-frozen" />
      )}

      {/* Markeri preko videa */}
      {hazards.map((h, i) => {
        const meta = SEVERITY_META[h.severity];
        return (
          <button
            key={h.id}
            className="hazard-box live-box"
            style={{
              left: `${h.box.x * 100}%`,
              top: `${h.box.y * 100}%`,
              width: `${h.box.w * 100}%`,
              height: `${h.box.h * 100}%`,
              borderColor: meta.color,
            }}
            onClick={() => pauseOn(h)}
            aria-label={h.label}
          >
            <span className="hazard-pin" style={{ background: meta.color }}>
              {i + 1}
            </span>
          </button>
        );
      })}

      {/* Status traka */}
      <div className="live-topbar">
        <span className="live-status">
          {analyzing && <span className="live-dot" />}
          {error
            ? "⚠️ " + error
            : analyzing
              ? "Analiziram…"
              : result
                ? `${unresolvedCount} ${unresolvedCount === 1 ? "opasnost uočena" : "opasnosti uočeno"}`
                : "Usmerite kameru na prostor"}
        </span>
        {result && (
          <span
            className="score"
            data-level={
              result.safety_score >= 70 ? "ok" : result.safety_score >= 40 ? "mid" : "bad"
            }
          >
            {result.safety_score}/100
          </span>
        )}
      </div>

      <div className="live-bottombar">
        {paused ? (
          <button className="btn btn-primary" onClick={resume}>
            ▶ Nastavi skeniranje
          </button>
        ) : (
          <button className="btn btn-close" onClick={close}>
            ✕ Zatvori
          </button>
        )}
      </div>

      {selectedHazard && (
        <HazardDetailSheet
          hazard={selectedHazard}
          onClose={resume}
          onToggleResolved={() => resume()}
        />
      )}
    </div>
  );
}
