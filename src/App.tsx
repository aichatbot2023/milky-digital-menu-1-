import { useEffect, useMemo, useState } from "react";
import type { ChildProfile, RoomType, ScanRecord } from "./types";
import { ROOM_LABELS } from "./types";
import { analyzeFood, offlineFoodGuidance, type FoodAnalysis } from "./lib/food";
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
import { captureRef, getAccount, getStatus, verifyCheckoutSession, type SubStatus } from "./lib/subscription";
import { Register } from "./components/Register";
import { LANGS, ageLabel, applyDir, getLang, langChosen, roomLabel, severityLabel, t } from "./lib/i18n";
import { LanguagePicker } from "./components/LanguagePicker";
import { Onboarding, onboardingSeen } from "./components/Onboarding";
import { ChecklistView } from "./components/ChecklistView";
import { FirstAid } from "./components/FirstAid";
import { ChildProfiles } from "./components/ChildProfiles";
import { FoodResult } from "./components/FoodResult";
import { Paywall } from "./components/Paywall";
import { VoiceAssistant } from "./components/VoiceAssistant";
import { HazardOverlay } from "./components/HazardOverlay";
import { HazardDetailSheet } from "./components/HazardDetailSheet";
import { LiveScan } from "./components/LiveScan";
import { ScanHistory } from "./components/ScanHistory";

type View = "home" | "scanning" | "result" | "live" | "food-scanning" | "food-result" | "checklist" | "firstaid";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [langReady, setLangReady] = useState(() => langChosen());
  const [onboarded, setOnboarded] = useState(() => onboardingSeen());
  const [shareMsg, setShareMsg] = useState(false);
  useEffect(() => applyDir(), [langReady]);
  const [profiles, setProfiles] = useState<ChildProfile[]>(() => loadProfiles());
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    () => loadProfiles()[0]?.id ?? null,
  );
  const [roomType, setRoomType] = useState<RoomType>("living_room");
  const [scans, setScans] = useState<ScanRecord[]>(() => loadScans());
  const [currentScan, setCurrentScan] = useState<ScanRecord | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<SubStatus>(() => getStatus());
  const [showPaywall, setShowPaywall] = useState(false);
  const [account, setAccount] = useState(() => getAccount());
  const [foodImage, setFoodImage] = useState<string | null>(null);
  const [foodResult, setFoodResult] = useState<FoodAnalysis | null>(null);
  const [foodOffline, setFoodOffline] = useState<string[] | null>(null);

  // Kapija za skeniranje: probni period (7 dana) ili aktivna pretplata
  const requireAccess = (): boolean => {
    const s = getStatus();
    setSubStatus(s);
    if (s.state === "expired") {
      setShowPaywall(true);
      return false;
    }
    return true;
  };

  useEffect(() => saveProfiles(profiles), [profiles]);

  // Povratak sa Stripe checkout-a: ?session_id=cs_... → serverska provera
  // uplate kod Stripe-a → Premium se aktivira automatski
  const [payMsg, setPayMsg] = useState<string | null>(null);
  useEffect(() => {
    captureRef();
    const sid = new URLSearchParams(window.location.search).get("session_id");
    if (!sid) return;
    window.history.replaceState(null, "", window.location.pathname);
    setPayMsg(t("pay.checking"));
    verifyCheckoutSession(sid).then((ok) => {
      if (ok) {
        setSubStatus(getStatus());
        setShowPaywall(false);
        setPayMsg(t("pay.thanks"));
      } else {
        setPayMsg(t("pay.failed"));
      }
      setTimeout(() => setPayMsg(null), 12000);
    });
  }, []);

  const selectedChild = useMemo(
    () => profiles.find((p) => p.id === selectedChildId) ?? null,
    [profiles, selectedChildId],
  );

  const startScan = async () => {
    if (!requireAccess()) return;
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
              ? `${cloud.summary} ${t("scan.extras")} ${extras.length} ${t("scan.extrasTail")}`
              : cloud.summary,
        };
      } else if (localS.status === "fulfilled") {
        result = {
          hazards: localHazards,
          safety_score: Math.max(20, 90 - localHazards.length * 12),
          summary:
            localHazards.length > 0
              ? t("scan.localSummary")
              : t("scan.localNone"),
        };
      } else {
        throw new Error(
          (cloudS as PromiseRejectedResult).reason?.message ??
            t("scan.failed"),
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
      setError(e?.message ?? t("scan.failed"));
      setView("home");
    }
  };

  // Sken hrane/pića: fotografija → AI procena po uzrastu (alergeni, gušenje…)
  const startFoodScan = async () => {
    if (!requireAccess()) return;
    setError(null);
    const photo = await capturePhoto();
    if (!photo) return;
    setView("food-scanning");
    const age = selectedChild?.age ?? "1-2y";
    try {
      const imageDataUrl = await downscaleImage(photo);
      setFoodImage(imageDataUrl);
      try {
        setFoodResult(
          await analyzeFood({
            imageDataUrl,
            ageGroup: age,
            childName: selectedChild?.name,
          }),
        );
        setFoodOffline(null);
      } catch {
        // Cloud nedostupan → lokalne smernice po uzrastu (ekran nikad prazan)
        setFoodResult(null);
        setFoodOffline(offlineFoodGuidance(age));
      }
      setView("food-result");
    } catch (e: any) {
      setError(e?.message ?? t("scan.failed"));
      setView("home");
    }
  };

  // Podeli izveštaj (Web Share; rezerva: kopiranje u clipboard)
  const shareReport = async () => {
    if (!currentScan) return;
    const { hazards, safety_score } = currentScan.result;
    const top = hazards
      .slice(0, 5)
      .map((h, i) => `${i + 1}. ${h.label} — ${h.fix}`)
      .join("\n");
    const text = `🛡️ ${t("share.title")}\n${roomLabel(currentScan.roomType)} · ${t("safety")}: ${safety_score}/100\n\n${top}\n\nhttps://safenessai.co.uk`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t("share.title"), text });
        return;
      }
    } catch {
      return; // korisnik odustao od deljenja
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareMsg(true);
      setTimeout(() => setShareMsg(false), 4000);
    } catch {
      /* ignoriši */
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

  if (!langReady) {
    return <LanguagePicker onDone={() => setLangReady(true)} />;
  }

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  // Obavezna registracija: bez naloga nema pristupa skeniranju
  if (!account) {
    return <Register onDone={() => setAccount(getAccount())} />;
  }

  if (view === "checklist") {
    return <ChecklistView initialRoom={roomType} onBack={() => setView("home")} />;
  }

  if (view === "firstaid") {
    return <FirstAid onBack={() => setView("home")} />;
  }

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

  if (view === "food-scanning") {
    return (
      <div className="app center">
        <div className="spinner" />
        <h2>{t("food.checking")}</h2>
        <p className="muted">
          {t("food.checkingSub")} {ageLabel(selectedChild?.age ?? "1-2y")}.
        </p>
      </div>
    );
  }

  if (view === "food-result" && foodImage) {
    return (
      <FoodResult
        image={foodImage}
        result={foodResult}
        offlineGuidance={foodOffline}
        ageLabel={ageLabel(selectedChild?.age ?? "1-2y")}
        onAgain={startFoodScan}
        onBack={() => setView("home")}
      />
    );
  }

  if (view === "scanning") {
    return (
      <div className="app center">
        <div className="spinner" />
        <h2>{t("scanning.title")}</h2>
        <p className="muted">
          {t("scanning.sub1")} {selectedChild ? selectedChild.name : t("scanning.child")}.{" "}
          {t("scanning.sub2")}
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
            {t("back")}
          </button>
          <span className="score" data-level={safety_score >= 70 ? "ok" : safety_score >= 40 ? "mid" : "bad"}>
            {t("safety")}: {safety_score}/100
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
                  {severityLabel(s)} {n}
                </span>
              );
            })}
            <span className="stat-chip stat-total">{t("stats.total")} {hazards.length}</span>
            <span className="stat-chip stat-done">
              {t("stats.resolved")} {hazards.filter((h) => h.resolved).length}
            </span>
          </div>
        )}

        <div className="share-row">
          <button className="btn btn-outline" onClick={shareReport}>
            {t("share.btn")}
          </button>
          {shareMsg && <span className="ok">{t("share.copied")}</span>}
        </div>

        <div className="hazard-list">
          {hazards.length === 0 && (
            <p className="ok">{t("result.none")}</p>
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
                {severityLabel(h.severity)}
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
        <div className="hero-top">
          <h1>🛡️ SafeNest AI</h1>
          <button
            className="chip lang-chip"
            onClick={() => setLangReady(false)}
            aria-label="Change language"
          >
            🌐 {LANGS.find((l) => l.code === getLang())?.native ?? "Language"}
          </button>
        </div>
        <p>{t("hero.sub")}</p>
      </header>

      {error && <div className="error">{error}</div>}
      {payMsg && <div className="paymsg">{payMsg}</div>}
      {scans[0] &&
        Math.floor((Date.now() - new Date(scans[0].createdAt).getTime()) / 86400000) >= 7 && (
          <div className="nudge">
            {t("nudge.pre")}{" "}
            {Math.floor((Date.now() - new Date(scans[0].createdAt).getTime()) / 86400000)}{" "}
            {t("nudge.days")}
          </div>
        )}

      <button className="subbar" onClick={() => setShowPaywall(true)}>
        {subStatus.state === "subscribed"
          ? t("sub.active")
          : subStatus.state === "trial"
            ? `${t("sub.trial")} ${subStatus.daysLeft} ${subStatus.daysLeft === 1 ? t("sub.dayLeft") : t("sub.daysLeft")} ${t("sub.trialTail")}`
            : t("sub.expired")}
      </button>

      <ChildProfiles
        profiles={profiles}
        selectedId={selectedChildId}
        onSelect={setSelectedChildId}
        onChange={setProfiles}
      />

      <div className="room-picker">
        <h3>{t("room.title")}</h3>
        <div className="profile-chips">
          {(Object.keys(ROOM_LABELS) as RoomType[]).map((r) => (
            <button
              key={r}
              className={`chip${r === roomType ? " chip-active" : ""}`}
              onClick={() => setRoomType(r)}
            >
              {roomLabel(r)}
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn btn-primary btn-scan"
        onClick={() => {
          if (requireAccess()) setView("live");
        }}
      >
        {t("btn.live")}
        <span className="btn-sub">{t("btn.live.sub")}</span>
      </button>
      <button className="btn btn-outline btn-scan" onClick={startScan}>
        {t("btn.photo")}
        <span className="btn-sub">{t("btn.photo.sub")}</span>
      </button>
      <button className="btn btn-outline btn-scan btn-food" onClick={startFoodScan}>
        {t("btn.food")}
        <span className="btn-sub">{t("btn.food.sub")}</span>
      </button>

      <div className="tool-row">
        <button className="btn btn-outline btn-tool" onClick={() => setView("checklist")}>
          {t("check.btn")}
          <span className="btn-sub">{t("check.btn.sub")}</span>
        </button>
        <button className="btn btn-outline btn-tool btn-fa" onClick={() => setView("firstaid")}>
          {t("fa.btn")}
          <span className="btn-sub">{t("fa.btn.sub")}</span>
        </button>
      </div>

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
        {t("footer.disclaimer")}
        <br />
        {t("footer.company")}
        <br />
        <a href="/privacy.html">Privacy (GDPR)</a> · <a href="/terms.html">Terms</a> ·{" "}
        <button className="lang-switch" onClick={() => setLangReady(false)}>
          🌐 Language
        </button>
        <br />
        {t("footer.version")} {__APP_VERSION__}
      </footer>

      {showPaywall && (
        <Paywall
          expired={subStatus.state === "expired"}
          onClose={() => setShowPaywall(false)}
          onSubscribed={() => {
            setSubStatus(getStatus());
            setShowPaywall(false);
          }}
        />
      )}
    </div>
  );
}
