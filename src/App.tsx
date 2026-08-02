import { useEffect, useMemo, useState } from "react";
import type { AnalysisResult, ChildProfile, Hazard, RoomType, ScanRecord } from "./types";
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
import {
  captureRef,
  checkGift,
  getAccount,
  getStatus,
  trackAppOpenOnce,
  trackScan,
  verifyCheckoutSession,
  type SubStatus,
} from "./lib/subscription";
import { Register } from "./components/Register";
import { Analyzing } from "./components/Analyzing";
import {
  daysSince,
  forgetMemory,
  reconcileWithMemory,
  rememberResolved,
  unresolvedMemories,
  type RememberedHazard,
} from "./lib/memory";
import { HazardFocus } from "./components/HazardFocus";
import { LANGS, ageLabel, applyDir, getLang, langChosen, roomLabel, t } from "./lib/i18n";
import { LanguagePicker } from "./components/LanguagePicker";
import { Onboarding, onboardingSeen } from "./components/Onboarding";
import { ChecklistView } from "./components/ChecklistView";
import { FirstAid } from "./components/FirstAid";
import { ChildProfiles } from "./components/ChildProfiles";
import { FoodResult } from "./components/FoodResult";
import { Paywall } from "./components/Paywall";
import { VoiceAssistant } from "./components/VoiceAssistant";
import { LiveScan } from "./components/LiveScan";
import { ScanHistory } from "./components/ScanHistory";
import { BottomNav, type Tab } from "./components/BottomNav";
import { Logo } from "./components/Logo";
import { Icon } from "./components/Icon";
import { CameraCapture } from "./components/CameraCapture";
import { clearMemory } from "./lib/memory";

type View = "home" | "scanning" | "result" | "live" | "food-scanning" | "food-result" | "checklist" | "firstaid";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [tab, setTab] = useState<Tab>("scan");
  /** Otvoren ekran kamere: "room" (prostor) ili "food" (hrana). */
  const [camera, setCamera] = useState<null | "room" | "food">(null);
  const [langReady, setLangReady] = useState(() => langChosen());
  const [onboarded, setOnboarded] = useState(() => onboardingSeen());
  useEffect(() => applyDir(), [langReady]);
  const [profiles, setProfiles] = useState<ChildProfile[]>(() => loadProfiles());
  const [selectedChildId, setSelectedChildId] = useState<string | null>(
    () => loadProfiles()[0]?.id ?? null,
  );
  const [roomType, setRoomType] = useState<RoomType>("living_room");
  const [scans, setScans] = useState<ScanRecord[]>(() => loadScans());
  const [currentScan, setCurrentScan] = useState<ScanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<SubStatus>(() => getStatus());
  const [showPaywall, setShowPaywall] = useState(false);
  const [account, setAccount] = useState(() => getAccount());
  const [foodImage, setFoodImage] = useState<string | null>(null);
  const [foodResult, setFoodResult] = useState<FoodAnalysis | null>(null);
  const [foodOffline, setFoodOffline] = useState<string[] | null>(null);
  /** Kadar koji se upravo analizira — prikazuje se na ekranu analize. */
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  /** Nerešeno iz ranijih skenova — memorija prepoznaje iste predmete. */
  const [carried, setCarried] = useState<RememberedHazard[]>(() => unresolvedMemories());
  /** Zapamćene opasnosti kojih nema u novom skenu — pitamo da li su rešene. */
  const [askFixed, setAskFixed] = useState<RememberedHazard[]>([]);

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
    trackAppOpenOnce();
    // Poklonjeni (free) nalozi: admin doda email u CRM → Premium bez plaćanja
    const acc = getAccount();
    if (acc && getStatus().state !== "subscribed") {
      checkGift(acc.email).then((ok) => ok && setSubStatus(getStatus()));
    }
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

  const startScan = async (captured?: string) => {
    if (!requireAccess()) return;
    setError(null);
    const photo = captured ?? (await capturePhoto());
    if (!photo) return;
    setPendingImage(photo);
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

      // BRZINA: ne čekamo oba modela. Cloud analiza je bogatija i stiže
      // prva — nju odmah prikazujemo, a lokalni nalazi se dopisuju u
      // pozadini kada budu gotovi. Percipirano čekanje = samo cloud.
      let result: AnalysisResult;
      let mergeLater = true;
      try {
        result = await cloudPromise;
      } catch (cloudErr) {
        // Cloud pao → sada stvarno čekamo lokalni model
        mergeLater = false;
        const localHazards = await localPromise.catch(() => []);
        if (localHazards.length === 0) {
          throw new Error((cloudErr as Error)?.message ?? t("scan.failed"));
        }
        result = {
          hazards: localHazards,
          safety_score: Math.max(20, 90 - localHazards.length * 12),
          summary: t("scan.localSummary"),
        };
      }

      // Memorija: prepoznaj iste predmete iz ranijih skenova ove prostorije
      const mem = await reconcileWithMemory(imageDataUrl, result.hazards, roomType);
      result = { ...result, hazards: mem.hazards };
      setAskFixed(mem.missing);
      setCarried(unresolvedMemories());

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
      trackScan("photo", roomType, age, result.hazards.map((h) => h.category), result.hazards.length);
      setView("result");

      // Pozadinsko dopunjavanje: sitni predmeti koje je lokalni model
      // uhvatio a cloud propustio. Prag pouzdanosti je visok jer je cloud
      // već dao pouzdanu listu — dodajemo samo ono u šta smo sigurni.
      if (mergeLater) {
        localPromise
          .then(async (localHazards: Hazard[]) => {
            const extras = localHazards
              .filter((lh) => (lh.confidence ?? 1) >= 0.5)
              .filter((lh) => result.hazards.every((ch: Hazard) => boxIou(lh.box, ch.box) < 0.4))
              .map((lh, i) => ({ ...lh, id: `merge-${i}-${lh.id}` }));
            if (extras.length === 0) return;
            const merged = await reconcileWithMemory(imageDataUrl, extras, roomType);
            setCurrentScan((prev) => {
              if (!prev || prev.id !== scan.id) return prev;
              const next = {
                ...prev,
                result: { ...prev.result, hazards: [...prev.result.hazards, ...merged.hazards] },
              };
              updateScan(next);
              return next;
            });
            setScans(loadScans());
          })
          .catch(() => {
            /* lokalni model nije uspeo — cloud rezultat je već prikazan */
          });
      }
    } catch (e: any) {
      setError(e?.message ?? t("scan.failed"));
      setView("home");
    }
  };

  // Sken hrane/pića: fotografija → AI procena po uzrastu (alergeni, gušenje…)
  const startFoodScan = async (captured?: string) => {
    if (!requireAccess()) return;
    setError(null);
    const photo = captured ?? (await capturePhoto());
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
      trackScan("food", "food", age, [], 0);
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
    // Memorija pamti rešeno, da se ista opasnost ne vraća u fokus
    const hz = currentScan.result.hazards.find((h) => h.id === hazardId);
    if (hz?.memoryId) {
      if (!hz.resolved) rememberResolved(hz.memoryId);
      setCarried(unresolvedMemories());
    }
  };

  if (!langReady) {
    return <LanguagePicker onDone={() => setLangReady(true)} />;
  }

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  // Obavezna registracija: bez naloga nema pristupa skeniranju
  if (!account) {
    return (
      <Register
        onDone={() => {
          const acc = getAccount();
          setAccount(acc);
          // Ako je email na listi poklona → Premium odmah
          if (acc) checkGift(acc.email).then((ok) => ok && setSubStatus(getStatus()));
        }}
      />
    );
  }

  if (camera) {
    const kind = camera;
    return (
      <CameraCapture
        hint={t(kind === "food" ? "cam.hintFood" : "cam.hint")}
        onClose={() => setCamera(null)}
        onCapture={(dataUrl) => {
          setCamera(null);
          if (kind === "food") startFoodScan(dataUrl);
          else startScan(dataUrl);
        }}
      />
    );
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
              trackScan(
            "live",
            roomType,
            selectedChild?.age ?? "1-2y",
            result.hazards.map((h) => h.category),
            result.hazards.length,
          );
          setView("result");
        }}
      />
    );
  }

  if (view === "food-scanning") {
    return (
      <Analyzing
        imageDataUrl={foodImage}
        title={t("analyzing.food")}
        steps={[t("analyzing.f1"), t("analyzing.f2"), t("analyzing.f3"), t("analyzing.f4")]}
      />
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
      <Analyzing
        imageDataUrl={pendingImage}
        title={t("analyzing.title")}
        steps={[
          t("analyzing.s1"),
          t("analyzing.s2"),
          t("analyzing.s3"),
          t("analyzing.s4"),
          t("analyzing.s5"),
        ]}
      />
    );
  }

  // Rezultat: JEDNA opasnost u fokusu, po stvarnom riziku za dete —
  // ne lista svih detekcija (to je debug prikaz, ne korisničko iskustvo)
  if (view === "result" && currentScan) {
    return (
      <>
        <HazardFocus
          imageDataUrl={currentScan.imageDataUrl}
          hazards={currentScan.result.hazards}
          baseScore={currentScan.result.safety_score}
          ageGroup={selectedChild?.age ?? "1-2y"}
          onToggleResolved={toggleResolved}
          onBack={() => setView("home")}
          onShare={shareReport}
        />
        <VoiceAssistant
          roomType={currentScan.roomType}
          ageGroup={selectedChild?.age ?? "1-2y"}
          hazards={currentScan.result.hazards}
        />
      </>
    );
  }

  return (
    <div className="app has-nav stagger">
      <header className="hero">
        <div className="hero-top">
          <Logo size={30} wordmark />
          <div className="hero-chips">
            <button
              className="chip sub-chip subbar"
              onClick={() => setShowPaywall(true)}
              data-state={subStatus.state}
            >
              {subStatus.state === "subscribed"
                ? "Premium"
                : subStatus.state === "trial"
                  ? `${subStatus.daysLeft} ${subStatus.daysLeft === 1 ? t("sub.dayLeft") : t("sub.daysLeft")}`
                  : t("paywall.subscribe")}
            </button>
            <button
              className="chip lang-chip"
              onClick={() => setLangReady(false)}
              aria-label="Change language"
            >
              <Icon name="globe" size={15} />
              {LANGS.find((l) => l.code === getLang())?.native ?? "Language"}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {payMsg && <div className="paymsg">{payMsg}</div>}

      {tab === "scan" && (
        <>
          {scans[0] &&
            Math.floor((Date.now() - new Date(scans[0].createdAt).getTime()) / 86400000) >= 7 && (
              <div className="nudge">
                {t("nudge.pre")}{" "}
                {Math.floor((Date.now() - new Date(scans[0].createdAt).getTime()) / 86400000)}{" "}
                {t("nudge.days")}
              </div>
            )}

          <div className="scan-hero">
            <h2>{t("scan.mainTitle")}</h2>
            <p>{t("scan.mainSub")}</p>
            <button className="scan-cta" onClick={() => requireAccess() && setCamera("room")}>
              <Icon name="camera" size={21} />
              {t("cam.shoot")}
            </button>
            <div className="scan-row">
              <button
                className="btn btn-outline"
                style={{ background: "rgba(255,255,255,.15)", color: "#fff", borderColor: "rgba(255,255,255,.5)" }}
                onClick={() => requireAccess() && setView("live")}
              >
                <Icon name="video" size={18} />
                {t("live.short")}
              </button>
              <button
                className="btn btn-outline"
                style={{ background: "rgba(255,255,255,.15)", color: "#fff", borderColor: "rgba(255,255,255,.5)" }}
                onClick={() => requireAccess() && setCamera("food")}
              >
                <Icon name="bottle" size={18} />
                {t("food.short")}
              </button>
            </div>
          </div>

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

          <ChildProfiles
            profiles={profiles}
            selectedId={selectedChildId}
            onSelect={setSelectedChildId}
            onChange={setProfiles}
          />
        </>
      )}

      {tab === "tips" && (
        <>
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
        </>
      )}

      {tab === "profile" && (
        <>
          <button className="subbar-full" onClick={() => setShowPaywall(true)}>
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
            <h3>{t("profile.memory")}</h3>
            <p className="muted">{t("profile.memoryNote")}</p>
            <button
              className="btn btn-outline"
              style={{ marginTop: 10 }}
              onClick={() => {
                clearMemory();
                setCarried([]);
                setAskFixed([]);
              }}
            >
              {t("profile.memoryClear")}
            </button>
          </div>
        </>
      )}

      {tab === "history" && (<>
      {/* Memorija: nerešeno iz ranijih skenova nije se pojavilo u novom —
          pitamo roditelja umesto da tiho zaboravimo */}
      {askFixed.length > 0 && (
        <div className="history mem-card">
          <h3>{t("mem.askTitle")}</h3>
          <p className="muted">{t("mem.askSub")}</p>
          <div className="mem-list">
            {askFixed.map((m) => (
              <div key={m.id} className="mem-item">
                <span className="mem-item-label">{m.label}</span>
                <div className="mem-ask-row">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      rememberResolved(m.id);
                      setAskFixed((p) => p.filter((x) => x.id !== m.id));
                      setCarried(unresolvedMemories());
                    }}
                  >
                    {t("mem.yesFixed")}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={() => setAskFixed((p) => p.filter((x) => x.id !== m.id))}
                  >
                    {t("mem.stillThere")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nerešeno od ranije — aplikacija pamti i prepoznaje iste predmete */}
      {carried.length > 0 && (
        <div className="history mem-card">
          <h3>{t("mem.carriedTitle")} ({carried.length})</h3>
          <p className="muted">{t("mem.carriedSub")}</p>
          <div className="mem-list">
            {carried.slice(0, 6).map((m) => (
              <div key={m.id} className="mem-item">
                <span className="mem-item-label">{m.label}</span>
                <span className="mem-item-days">
                  {daysSince(m.firstSeen) > 0
                    ? `${daysSince(m.firstSeen)} ${t("mem.days")}`
                    : t("mem.since")}
                </span>
                <button
                  className="history-delete"
                  onClick={() => {
                    forgetMemory(m.id);
                    setCarried(unresolvedMemories());
                  }}
                  aria-label={t("history.delete")}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ScanHistory
        scans={scans}
        onOpen={(s) => {
          setCurrentScan(s);
              setView("result");
        }}
        onDelete={(id) => {
          deleteScan(id);
          setScans(loadScans());
        }}
      />
      {scans.length === 0 && carried.length === 0 && askFixed.length === 0 && (
        <div className="history empty-state">
          <div className="empty-emoji"><Icon name="history" size={42} /></div>
          <h3>{t("hist.emptyTitle")}</h3>
          <p className="muted">{t("hist.emptySub")}</p>
          <button className="btn btn-primary" onClick={() => setTab("scan")}>
            {t("scan.mainTitle")}
          </button>
        </div>
      )}
      </>)}

      <BottomNav tab={tab} onChange={setTab} pending={carried.length} />

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
