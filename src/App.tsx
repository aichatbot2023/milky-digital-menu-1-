import { useEffect, useMemo, useState } from "react";
import type { ChildProfile, RoomType, ScanRecord } from "./types";
import { ROOM_LABELS } from "./types";
import { analyzeImage, downscaleImage } from "./lib/analyze";
import { capturePhoto } from "./lib/camera";
import {
  deleteScan,
  loadProfiles,
  loadScans,
  saveProfiles,
  saveScan,
  updateScan,
} from "./lib/storage";
import { ChildProfiles } from "./components/ChildProfiles";
import { HazardOverlay } from "./components/HazardOverlay";
import { HazardDetailSheet } from "./components/HazardDetailSheet";
import { LiveScan } from "./components/LiveScan";
import { ScanHistory } from "./components/ScanHistory";

type View = "home" | "scanning" | "result" | "live";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [profiles, setProfiles] = useState<ChildProfile[]>(() => loadProfiles());
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    () => loadProfiles()[0]?.id ?? null,
  );
  const [roomType, setRoomType] = useState<RoomType>("living_room");
  const [scans, setScans] = useState<ScanRecord[]>(() => loadScans());
  const [currentScan, setCurrentScan] = useState<ScanRecord | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveProfiles(profiles), [profiles]);

  const selectedChild = useMemo(
    () => profiles.find((p) => p.id === selectedChildId) ?? null,
    [profiles, selectedChildId],
  );

  const startScan = async () => {
    setError(null);
    const photo = await capturePhoto();
    if (!photo) return;
    setView("scanning");
    try {
      const imageDataUrl = await downscaleImage(photo);
      const age = selectedChild?.age ?? "1-2y";
      let result;
      try {
        result = await analyzeImage({
          imageDataUrl,
          roomType,
          ageGroup: age,
          childName: selectedChild?.name,
        });
      } catch (cloudErr: any) {
        // Cloud AI nedostupan → lokalna detekcija u browseru (COCO-SSD)
        const { detectLocal } = await import("./lib/detector");
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(cloudErr);
          el.src = imageDataUrl;
        });
        const hazards = await detectLocal(img, img.width, img.height, age);
        result = {
          hazards,
          safety_score: Math.max(20, 90 - hazards.length * 12),
          summary:
            "Rezultat lokalne AI detekcije (cloud analiza trenutno nedostupna). Prikazani su prepoznati rizični objekti za izabrani uzrast.",
        };
      }
      const scan: ScanRecord = {
        id: `scan-${Date.now()}`,
        createdAt: new Date().toISOString(),
        roomType,
        childId: selectedChildId,
        imageDataUrl,
        result,
      };
      saveScan(scan);
      setScans(loadScans());
      setCurrentScan(scan);
      setSelectedHazardId(null);
      setView("result");
    } catch (e: any) {
      setError(e?.message ?? "Analiza nije uspela. Pokušajte ponovo.");
      setView("home");
    }
  };

  const toggleResolved = (hazardId: string) => {
    if (!currentScan) return;
    const next: ScanRecord = {
      ...currentScan,
      result: {
        ...currentScan.result,
        hazards: currentScan.result.hazards.map((h) =>
          h.id === hazardId ? { ...h, resolved: !h.resolved } : h,
        ),
      },
    };
    setCurrentScan(next);
    updateScan(next);
    setScans(loadScans());
  };

  const selectedHazard =
    currentScan?.result.hazards.find((h) => h.id === selectedHazardId) ?? null;

  if (view === "live") {
    return (
      <LiveScan
        roomType={roomType}
        ageGroup={selectedChild?.age ?? "1-2y"}
        childName={selectedChild?.name}
        onClose={() => setView("home")}
      />
    );
  }

  if (view === "scanning") {
    return (
      <div className="app center">
        <div className="spinner" />
        <h2>AI analizira prostor…</h2>
        <p className="muted">
          Tražimo opasnosti za{" "}
          {selectedChild ? `${selectedChild.name}` : "dete"} — ovo traje 10–30 sekundi.
        </p>
      </div>
    );
  }

  if (view === "result" && currentScan) {
    const { hazards, safety_score, summary } = currentScan.result;
    return (
      <div className="app">
        <header className="topbar">
          <button className="btn btn-ghost" onClick={() => setView("home")}>
            ← Nazad
          </button>
          <span className="score" data-level={safety_score >= 70 ? "ok" : safety_score >= 40 ? "mid" : "bad"}>
            Bezbednost: {safety_score}/100
          </span>
        </header>

        <HazardOverlay
          imageUrl={currentScan.imageDataUrl}
          hazards={hazards}
          selectedId={selectedHazardId}
          onSelect={setSelectedHazardId}
        />

        <p className="summary">{summary}</p>

        <div className="hazard-list">
          {hazards.length === 0 && (
            <p className="ok">Nismo uočili opasnosti na ovoj fotografiji. 🎉</p>
          )}
          {hazards.map((h, i) => (
            <button
              key={h.id}
              className={`hazard-row${h.resolved ? " resolved" : ""}`}
              onClick={() => setSelectedHazardId(h.id)}
            >
              <span className="hazard-num">{h.resolved ? "✓" : i + 1}</span>
              <span className="hazard-row-label">{h.label}</span>
              <span className="hazard-row-sev" data-sev={h.severity}>
                {h.severity === "critical"
                  ? "Kritično"
                  : h.severity === "high"
                    ? "Visoko"
                    : h.severity === "medium"
                      ? "Srednje"
                      : "Nisko"}
              </span>
            </button>
          ))}
        </div>

        {selectedHazard && (
          <HazardDetailSheet
            hazard={selectedHazard}
            onClose={() => setSelectedHazardId(null)}
            onToggleResolved={toggleResolved}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        <h1>🛡️ SafeNest AI</h1>
        <p>
          Skenirajte prostor kamerom — AI označava opasnosti po vaše dete i
          pokazuje kako da ih uklonite.
        </p>
      </header>

      {error && <div className="error">{error}</div>}

      <ChildProfiles
        profiles={profiles}
        selectedId={selectedChildId}
        onSelect={setSelectedChildId}
        onChange={setProfiles}
      />

      <div className="room-picker">
        <h3>Tip prostora</h3>
        <div className="profile-chips">
          {(Object.keys(ROOM_LABELS) as RoomType[]).map((r) => (
            <button
              key={r}
              className={`chip${r === roomType ? " chip-active" : ""}`}
              onClick={() => setRoomType(r)}
            >
              {ROOM_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary btn-scan" onClick={() => setView("live")}>
        🎥 Uživo skeniranje
      </button>
      <button className="btn btn-outline btn-scan" onClick={startScan}>
        📷 Skeniraj fotografiju
      </button>

      <ScanHistory
        scans={scans}
        onOpen={(s) => {
          setCurrentScan(s);
          setSelectedHazardId(null);
          setView("result");
        }}
        onDelete={(id) => {
          deleteScan(id);
          setScans(loadScans());
        }}
      />

      <footer className="disclaimer">
        SafeNest AI je pomoćni alat i ne zamenjuje nadzor odrasle osobe.
        <br />
        verzija {__APP_VERSION__}
      </footer>
    </div>
  );
}
