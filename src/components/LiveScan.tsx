import { useCallback, useEffect, useRef, useState } from "react";
import type { AgeGroup, AnalysisResult, Hazard, RoomType } from "../types";
import { SEVERITY_META } from "../types";
import { analyzeImage } from "../lib/analyze";
import { detectLocal, preloadDetector } from "../lib/detector";
import { HazardDetailSheet } from "./HazardDetailSheet";

interface Props {
  roomType: RoomType;
  ageGroup: AgeGroup;
  childName?: string;
  onClose: () => void;
}

// Dvoslojna detekcija (isti sistem kao omni):
//  1. LOKALNI YOLO u browseru — svake ~1.2s, besplatno i neograničeno
//  2. CLOUD vision AI — svakih 10s, bogata analiza (zašto/statistika/rešenje)
const LOCAL_INTERVAL_MS = 1200;
const CLOUD_INTERVAL_MS = 10000;
const LOCAL_EDGE = 640;
const CLOUD_EDGE = 1024;

export function LiveScan({ roomType, ageGroup, childName, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const localBusy = useRef(false);
  const cloudBusy = useRef(false);
  const pausedRef = useRef(false);

  const [localHazards, setLocalHazards] = useState<Hazard[]>([]);
  const [cloudResult, setCloudResult] = useState<AnalysisResult | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const captureFrame = useCallback(
    (maxEdge: number): { dataUrl: string; w: number; h: number } | null => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return null;
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.8),
        w: canvas.width,
        h: canvas.height,
      };
    },
    [],
  );

  // Kamera
  useEffect(() => {
    preloadDetector();
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
        setCameraError(
          "Kamera nije dostupna ili je pristup odbijen. Dozvolite kameru u podešavanjima ili koristite foto mod.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  // Lokalni YOLO — brza petlja
  useEffect(() => {
    const tick = async () => {
      if (localBusy.current || pausedRef.current) return;
      const frame = captureFrame(LOCAL_EDGE);
      if (!frame) return;
      localBusy.current = true;
      try {
        const hazards = await detectLocal(frame.dataUrl, frame.w, frame.h, ageGroup);
        setModelReady(true);
        if (!pausedRef.current) setLocalHazards(hazards);
      } catch {
        // model se možda još učitava — pokušaće opet u sledećem ciklusu
      } finally {
        localBusy.current = false;
      }
    };
    const id = setInterval(tick, LOCAL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [captureFrame, ageGroup]);

  // Cloud AI — spora petlja (bogata analiza)
  useEffect(() => {
    const tick = async () => {
      if (cloudBusy.current || pausedRef.current) return;
      const frame = captureFrame(CLOUD_EDGE);
      if (!frame) return;
      cloudBusy.current = true;
      try {
        const res = await analyzeImage({
          imageDataUrl: frame.dataUrl,
          roomType,
          ageGroup,
          childName,
        });
        if (!pausedRef.current) {
          setCloudResult(res);
          setCloudError(null);
        }
      } catch (e: any) {
        // Cloud pad NIJE fatalan — lokalna detekcija nastavlja da radi
        setCloudError(e?.message ?? "Cloud analiza trenutno nedostupna");
      } finally {
        cloudBusy.current = false;
      }
    };
    const startId = setTimeout(tick, 2500);
    const id = setInterval(tick, CLOUD_INTERVAL_MS);
    return () => {
      clearInterval(id);
      clearTimeout(startId);
    };
  }, [captureFrame, roomType, ageGroup, childName]);

  const pauseOn = (hazard: Hazard) => {
    pausedRef.current = true;
    setPaused(true);
    setFrozenFrame(captureFrame(CLOUD_EDGE)?.dataUrl ?? null);
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

  // Unija: lokalni (živi) + cloud (bogati) markeri
  const hazards: Hazard[] = [...localHazards, ...(cloudResult?.hazards ?? [])];
  const count = hazards.length;

  const status = cameraError
    ? "⚠️ " + cameraError
    : !modelReady
      ? "Učitavam AI model… (jednokratno, ~25 MB)"
      : count > 0
        ? `${count} ${count === 1 ? "opasnost uočena" : "opasnosti uočeno"}`
        : "Skeniram — usmerite kameru na prostor";

  return (
    <div className="live-wrap">
      <video ref={videoRef} className="live-video" playsInline muted autoPlay />
      {paused && frozenFrame && (
        <img src={frozenFrame} alt="" className="live-video live-frozen" />
      )}

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

      <div className="live-topbar">
        <span className="live-status">
          {!cameraError && !paused && <span className="live-dot" />}
          {status}
        </span>
        {cloudResult && (
          <span
            className="score"
            data-level={
              cloudResult.safety_score >= 70
                ? "ok"
                : cloudResult.safety_score >= 40
                  ? "mid"
                  : "bad"
            }
          >
            {cloudResult.safety_score}/100
          </span>
        )}
      </div>

      {cloudError && !cameraError && (
        <div className="live-cloudnote">
          Lokalna detekcija aktivna · cloud analiza: {cloudError}
        </div>
      )}

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
