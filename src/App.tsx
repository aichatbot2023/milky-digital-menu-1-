import { useEffect, useMemo, useState } from "react";
import type { ChildProfile, RoomType, ScanRecord } from "./types";
import { ROOM_LABELS } from "./types";
import { analyzeImage, downscaleImage } from "./lib/analyze";
import { boxIou, detectLocal } from "./lib/detector";
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
import { VoiceAssistant } from "./components/VoiceAssistant";
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

      // DVOSTRUKA PRECIZNA ANALIZA, paralelno:
      //  - lokalni model: pločasta multi-scale detekcija (ceo kadar + zumirane
      //    pločice) — hvata i sitne predmete koje jedan prolaz ne vidi
      //  - cloud vision AI: bogata analiza (zašto/statistika/rešenje/zone)
      // Rezultati se SPAJAJU (dedup po preklapanju), ne bira se samo jedan.
      const localPromise = (async () => {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Slika ne može da se učita"));
          el.src = imageDataUrl;
        });
        return detectLocal(img, img.width, img.height, age, { detail: "photo" });
      })();
      const cloudPromise = analyzeImage({
        imageDataUrl,
        roomType,
        ageGroup: age,
        childName: selectedChild?.name,
      });

      const [cloudS, localS] = await Promise.allSettled([cloudPromise, localPromise]);
      const localHazards = localS.status === "fulfilled" ? localS.value : [];

      let result;
      if (cloudS.status === "fulfilled") {
        // Spoji: cloud nalazi + lokalni koji NISU isti objekat (IoU < 0.4)
        const cloud = cloudS.value;
        const extras = localHazards
          .filter((lh) => cloud.hazards.every((ch) => boxIou(lh.box, ch.box) < 0.4))
          .map((lh, i) => ({ ...lh, id: `merge-${i}-${lh.id}` }));
        result = {
          ...cloud,
          hazards: [...cloud.hazards, ...extras],
          summary:
            extras.length > 0
              ? `${cloud.summary} Lokalni AI je precizno uočio još ${extras.length} ${extras.length === 1 ? "objekat" : "objekta/objekata"}.`
              : cloud.summary,
        };
      } else if (localS.status === "fulfilled") {
        result = {
          hazards: localHazards,
          safety_score: Math.max(20, 90 - localHazards.length * 12),
          summary:
            localHazards.length > 0
              ? "Precizna lokalna AI analiza (višeslojno skeniranje slike): prepoznati su rizični objekti za izabrani uzrast. Dodirnite marker za objašnjenje i rešenje."
              : "Precizna lokalna AI analiza nije uočila rizične objekte. Proverite i zone koje model ne vidi (utičnice, ivice, kablovi).",
        };
      } else {
        throw new Error(
          (cloudS as PromiseRejectedResult).reason?.message ??
            "Analiza nije uspela. Pokušajte ponovo.",
        );
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
        onFinish={(imageDataUrl, result) => {
          // Kraj uživo sesije → sačuvan izveštaj, isti tok kao foto sken
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
        }}
      />
    );
  }

  if (view === "scanning") {
    return (
      <div className="app center">
        <div className="spinner" />
        <h2>AI analizira prostor…</h2>
        <p className="muted">
          Višeslojna precizna analiza (lokalni AI + cloud) — tražimo i sitne
          predmete opasne za {selectedChild ? `${selectedChild.name}` : "dete"}.
          Ovo traje 10–30 sekundi.
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

        {hazards.length > 0 && (
          <div className="stats-row">
            {(["critical", "high", "medium", "low"] as const).map((s) => {
              const n = hazards.filter((h) => h.severity === s).length;
              if (n === 0) return null;
              return (
                <span key={s} className="stat-chip" data-sev={s}>
                  {s === "critical"
                    ? "Kritično"
                    : s === "high"
                      ? "Visoko"
                      : s === "medium"
                        ? "Srednje"
                        : "Nisko"}{" "}
                  {n}
                </span>
              );
            })}
            <span className="stat-chip stat-total">Ukupno {hazards.length}</span>
            <span className="stat-chip stat-done">
              Rešeno {hazards.filter((h) => h.resolved).length}
            </span>
          </div>
        )}

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

        <VoiceAssistant
          roomType={currentScan.roomType}
          ageGroup={selectedChild?.age ?? "1-2y"}
          hazards={hazards}
        />

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
        <span className="btn-sub">AI označava i objašnjava opasnosti u realnom vremenu</span>
      </button>
      <button className="btn btn-outline btn-scan" onClick={startScan}>
        📷 Skeniraj fotografiju
        <span className="btn-sub">Detaljna analiza jedne slike prostora</span>
      </button>

      <VoiceAssistant
        roomType={roomType}
        ageGroup={selectedChild?.age ?? "1-2y"}
        hazards={scans[0]?.result.hazards ?? []}
      />

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
