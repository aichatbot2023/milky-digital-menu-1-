import { useCallback, useEffect, useRef, useState } from "react";
import type { AgeGroup, AnalysisResult, Hazard, RoomType } from "../types";
import { SEVERITY_META } from "../types";
import { analyzeImage } from "../lib/analyze";
import { boxIou, detectLocal, modelError, preloadDetector, retryDetector } from "../lib/detector";
import { primeTts, speak, stopSpeaking } from "../lib/voice";
import { HazardDetailSheet } from "./HazardDetailSheet";

interface Props {
  roomType: RoomType;
  ageGroup: AgeGroup;
  childName?: string;
  onClose: () => void;
  /** Kraj sesije: sačuvan izveštaj (poslednji kadar + sve opasnosti iz sesije). */
  onFinish: (imageDataUrl: string, result: AnalysisResult) => void;
}

// Dvoslojna detekcija (isti sistem kao omni):
//  1. LOKALNI YOLO u browseru — svake ~1.2s, besplatno i neograničeno
//  2. CLOUD vision AI — svakih 10s, bogata analiza (zašto/statistika/rešenje)
const LOCAL_INTERVAL_MS = 1200;
const CLOUD_INTERVAL_MS = 10000;
const CLOUD_EDGE = 1024;
const SPEAK_GAP_MS = 4000;
// Kratkoročna memorija detekcija: kvadranti se dubinski skeniraju naizmenično,
// pa nalaz ostaje na ekranu dok rotacija ne stigne ponovo do njega (bez treperenja)
const MEMORY_TTL_MS = 5500;

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function LiveScan({ roomType, ageGroup, childName, onClose, onFinish }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const localBusy = useRef(false);
  const cloudBusy = useRef(false);
  const pausedRef = useRef(false);
  // Sesija: sve jedinstvene opasnosti viđene tokom skeniranja (za izveštaj)
  const sessionRef = useRef<Map<string, Hazard>>(new Map());
  const spokenRef = useRef<Set<string>>(new Set());
  const lastSpokeRef = useRef(0);
  const soundRef = useRef(false);
  const tickRef = useRef(0);
  const memoryRef = useRef<Map<string, { h: Hazard; ts: number }>>(new Map());

  const [localHazards, setLocalHazards] = useState<Hazard[]>([]);
  const [cloudResult, setCloudResult] = useState<AnalysisResult | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelFail, setModelFail] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

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
      stopSpeaking();
    };
  }, [stopStream]);

  // Lokalna detekcija — brza petlja (video element ide direktno u model)
  useEffect(() => {
    const tick = async () => {
      if (localBusy.current || pausedRef.current) return;
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      localBusy.current = true;
      try {
        // Ceo kadar + jedan "zumirani" kvadrant (rotira se → precizna
        // pokrivenost cele slike na svakih ~5 sekundi, hvata i sitne predmete)
        const hazards = await detectLocal(
          video,
          video.videoWidth,
          video.videoHeight,
          ageGroup,
          { quadrant: tickRef.current++ % 4 },
        );
        setModelReady(true);
        setModelFail(null);
        // Upis u kratkoročnu memoriju (stabilan prikaz bez treperenja)
        const now = Date.now();
        for (const h of hazards) {
          const cx = h.box.x + h.box.w / 2;
          const cy = h.box.y + h.box.h / 2;
          const key = `${h.sourceClass ?? h.label}@${Math.round(cx * 6)},${Math.round(cy * 6)}`;
          memoryRef.current.set(key, { h: { ...h, id: key }, ts: now });
        }
        for (const [k, v] of memoryRef.current) {
          if (now - v.ts > MEMORY_TTL_MS) memoryRef.current.delete(k);
        }
        if (!pausedRef.current) {
          setLocalHazards([...memoryRef.current.values()].map((v) => v.h));
        }
      } catch (e: any) {
        // Učitavanje modela palo — prikaži razlog umesto večnog "Učitavam…"
        if (modelError) setModelFail(modelError);
        else if (e?.message) setModelFail(e.message);
      } finally {
        localBusy.current = false;
      }
    };
    const id = setInterval(tick, LOCAL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ageGroup]);

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

  // Unija: cloud (Nemotron — tačniji u IDENTIFIKACIJI: zna šta su kolica,
  // flašica...) ima prednost; lokalni marker se skriva ako se preklapa sa
  // cloud nalazom, da pogrešan lokalni naziv ne pregazi tačan cloud naziv.
  const cloudHz = cloudResult?.hazards ?? [];
  const hazards: Hazard[] = [
    ...cloudHz,
    ...localHazards.filter((lh) =>
      cloudHz.every((ch) => boxIou(lh.box, ch.box) < 0.4),
    ),
  ].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const count = hazards.length;
  const topHazard = hazards[0] ?? null;

  // Sesija + glasovna upozorenja na SVAKU novu opasnost
  useEffect(() => {
    for (const h of hazards) {
      const prev = sessionRef.current.get(h.label);
      if (!prev || SEV_ORDER[h.severity] < SEV_ORDER[prev.severity]) {
        sessionRef.current.set(h.label, h);
      }
    }
    setSessionCount(sessionRef.current.size);

    if (soundRef.current && topHazard) {
      const now = Date.now();
      const fresh = hazards.find(
        (h) =>
          !spokenRef.current.has(h.label) &&
          (h.severity === "critical" || h.severity === "high"),
      );
      if (fresh && now - lastSpokeRef.current > SPEAK_GAP_MS) {
        spokenRef.current.add(fresh.label);
        lastSpokeRef.current = now;
        speak(
          `Pažnja: ${fresh.label}. ${SEVERITY_META[fresh.severity].label} rizik. ${fresh.fix}`,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localHazards, cloudResult]);

  const toggleSound = () => {
    primeTts(); // otključava TTS na korisnički dodir (iOS)
    const next = !soundOn;
    soundRef.current = next;
    setSoundOn(next);
    if (next) speak("Glasovna upozorenja uključena.");
    else stopSpeaking();
  };

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
    stopSpeaking();
    onClose();
  };

  // Kraj sesije → izveštaj: poslednji kadar + SVE opasnosti viđene tokom skena
  const finish = () => {
    const frame = captureFrame(CLOUD_EDGE)?.dataUrl ?? frozenFrame;
    stopStream();
    stopSpeaking();
    if (!frame) {
      onClose();
      return;
    }
    const all = [...sessionRef.current.values()].sort(
      (a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity],
    );
    const score =
      cloudResult?.safety_score ?? Math.max(15, 92 - all.length * 10);
    const result: AnalysisResult = {
      hazards: all.map((h, i) => ({ ...h, id: `live-${i}-${h.id}` })),
      safety_score: score,
      summary:
        all.length > 0
          ? `Uživo skeniranje završeno: tokom sesije uočeno je ${all.length} potencijalnih opasnosti. Prođite kroz listu, rešite ih jednu po jednu i označite kao rešene.`
          : "Uživo skeniranje završeno bez uočenih opasnosti. Proverite i zone koje kamera ne vidi (utičnice, gajtani, hemikalije u ormarićima).",
    };
    onFinish(frame, result);
  };

  const status = cameraError
    ? "⚠️ " + cameraError
    : modelFail
      ? `⚠️ Model: ${modelFail.slice(0, 80)}`
      : !modelReady
        ? "Učitavam AI model… (par sekundi, jednokratno)"
        : count > 0
          ? `${count} ${count === 1 ? "opasnost u kadru" : "opasnosti u kadru"}`
          : "Skeniram — polako pomerajte kameru kroz prostor";

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
            <span className="live-tag" style={{ background: meta.color }}>
              {i + 1} · {h.label} — {meta.label}
              {h.confidence !== undefined && ` · ${Math.round(h.confidence * 100)}%`}
            </span>
          </button>
        );
      })}

      <div className="live-topbar">
        <span className="live-status">
          {!cameraError && !paused && <span className="live-dot" />}
          {status}
        </span>
        <div className="live-topbtns">
          <button
            className={`live-iconbtn${soundOn ? " live-iconbtn-on" : ""}`}
            onClick={toggleSound}
            aria-label="Glasovna upozorenja"
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
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
      </div>

      {cloudError && !cameraError && (
        <div className="live-cloudnote">
          Lokalna detekcija aktivna · cloud analiza: {cloudError}
        </div>
      )}

      {/* ŽIVO objašnjenje najozbiljnije opasnosti u kadru */}
      {topHazard && !paused && (
        <button className="live-strip" onClick={() => pauseOn(topHazard)}>
          <span
            className="live-strip-sev"
            style={{ background: SEVERITY_META[topHazard.severity].color }}
          >
            {SEVERITY_META[topHazard.severity].label}
          </span>
          <span className="live-strip-body">
            <strong>{topHazard.label}</strong>
            <span className="live-strip-why">{topHazard.why}</span>
            <span className="live-strip-hint">Dodirnite za rešenje i statistiku →</span>
          </span>
        </button>
      )}

      <div className="live-bottombar">
        {paused ? (
          <button className="btn btn-primary" onClick={resume}>
            ▶ Nastavi skeniranje
          </button>
        ) : (
          <>
            {modelFail && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setModelFail(null);
                  retryDetector();
                }}
              >
                ↻ Pokušaj ponovo
              </button>
            )}
            <button className="btn btn-primary btn-finish" onClick={finish}>
              ✓ Završi sken{sessionCount > 0 ? ` (${sessionCount})` : ""}
            </button>
            <button className="btn btn-close" onClick={close}>
              ✕
            </button>
          </>
        )}
      </div>
      <div className="live-version">v{__APP_VERSION__}</div>

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
