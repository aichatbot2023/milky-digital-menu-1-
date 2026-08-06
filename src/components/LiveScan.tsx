import { useCallback, useEffect, useRef, useState } from "react";
import type { AgeGroup, AnalysisResult, Hazard, RoomType } from "../types";
import { SEVERITY_META } from "../types";
import { CATEGORY_ICONS, hazardName, severityLabel, t } from "../lib/i18n";
import { analyzeImage } from "../lib/analyze";
import { rankHazards } from "../lib/priority";
import { boxIou, detectLocal, modelError, preloadDetector, retryDetector } from "../lib/detector";
import { primeTts, speak, stopSpeaking } from "../lib/voice";
import { HazardTracker } from "../lib/tracker";
import { HazardDetailSheet } from "./HazardDetailSheet";

interface Props {
  roomType: RoomType;
  ageGroup: AgeGroup;
  childName?: string;
  onClose: () => void;
  /** Kraj sesije: sačuvan izveštaj (poslednji kadar + sve opasnosti iz sesije). */
  onFinish: (imageDataUrl: string, result: AnalysisResult) => void;
}

// Dvoslojna detekcija:
//  1. LOKALNI YOLO u browseru — besplatno i neograničeno
//  2. CLOUD vision AI — svakih 10s, bogata analiza (zašto/statistika/rešenje)
const CLOUD_INTERVAL_MS = 10000;
const CLOUD_EDGE = 1024;
const SPEAK_GAP_MS = 4000;

/**
 * PETLJA GLEDA KAD I RODITELJ GLEDA.
 *
 * Ranije je ovde stajao `setInterval` na 1200 ms, uz zastavicu „zauzet".
 * Interval je bio čista fikcija: izmereno je da jedan prolaz traje 3,3 s
 * samo za ceo kadar, a 6,9 s kad se doda i rotirajući kvadrant. Tajmer je
 * dakle otkucavao u prazno, a model je radio bez prestanka — telefon se
 * grejao, baterija je curila, a slika na ekranu je i dalje kasnila.
 *
 * Sada se ne kuca po satu nego po onome što kamera radi. Dok roditelj
 * prelazi pogledom po sobi, nalaz ionako zastari pre nego što stigne, pa
 * se model ne gnjavi bez potrebe — kadar se samo poredi sa prethodnim, što
 * košta oko jedne milisekunde. Čim ruka stane, model kreće ODMAH, a ako
 * roditelj i dalje drži mirno, ide i dublji prolaz sa uveličanim delom
 * kadra. To je i brže i tačnije od otkucavanja u prazno, a usput je i
 * jedina stvar u ovome koju roditelj svesno primeti: aplikacija reaguje
 * na to što se zaustavio.
 */
const MOTION_SAMPLE_MS = 120;
/**
 * Prosečna razlika piksela (0–255) iznad koje se kadar smatra pokretnim.
 *
 * Broj je IZMEREN, ne procenjen. Na istom kadru: nepomična kamera daje 0,
 * sporo prevlačenje (60 px/s) daje ~5, sweep preko sobe (240 px/s) daje ~14.
 * Prva napisana vrednost je bila 5,5 — tačno iznad sporog prevlačenja, pa je
 * pomeranje kamere prolazilo kao mirovanje i cela zamisao nije radila.
 *
 * Prag je namerno nisko: greška na stranu „pokreće se" ništa ne kvari, jer
 * se i tada gleda na svakih MAX_GAP_MS. Šum senzora u mračnoj sobi tako
 * najviše znači da se dubinski prolaz ređe pali — ne i da se prestaje gledati.
 */
const MOTION_LEVEL = 3;
/** Koliko kadar mora da miruje da bi krenuo dubinski prolaz. */
const STILL_FOR_DEEP_MS = 900;
/** I dok se kamera pomera, presek stanja se pravi bar ovoliko često. */
const MAX_GAP_MS = 2200;

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function LiveScan({ roomType, ageGroup, childName, onClose, onFinish }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cloudBusy = useRef(false);
  const cloudFails = useRef(0);
  const cloudSkip = useRef(0);
  const pausedRef = useRef(false);
  // Sesija: sve jedinstvene opasnosti viđene tokom skeniranja (za izveštaj)
  const sessionRef = useRef<Map<string, Hazard>>(new Map());
  const spokenRef = useRef<Set<string>>(new Set());
  const lastSpokeRef = useRef(0);
  const soundRef = useRef(false);
  const tickRef = useRef(0);
  const trackerRef = useRef(new HazardTracker());

  const [localHazards, setLocalHazards] = useState<Hazard[]>([]);
  const [cloudResult, setCloudResult] = useState<AnalysisResult | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelFail, setModelFail] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /** Šta petlja upravo radi — status traka bez ovoga ćuti sekundama. */
  const [phase, setPhase] = useState<"idle" | "moving" | "looking" | "closer">("idle");
  /**
   * Koja je opasnost u fokusu — po IDENTITETU PREDMETA, ne po mestu u listi.
   *
   * Ranije je ovde stajao redni broj. Lista se preuređuje pri svakom nalazu
   * (rangira se po riziku), pa je broj 0 posle sekunde pokazivao na nešto
   * drugo: kartica bi se zamenila dok je roditelj čita, a reflektor bi
   * odskočio preko pola ekrana. Izmereno na nepokretnoj kameri: dva skoka
   * u 24 sekunde, najdalji preko 69 % širine ekrana.
   *
   * Uz identitet predmeta fokus se pomera samo kad ga roditelj pomeri —
   * ili kad predmet zaista izađe iz kadra.
   */
  const [focusId, setFocusId] = useState<string | null>(null);
  /** Režim prikaza: jedna po jedna (fokus) ili sve odjednom (pregled). */
  const [showAll, setShowAll] = useState(() => {
    try {
      return localStorage.getItem("safenest.liveAll") === "1";
    } catch {
      return false;
    }
  });
  /** Nagoveštaj listanja prestaje čim korisnik prvi put prelista. */
  const [pagerTouched, setPagerTouched] = useState(false);
  const swipeX = useRef<number | null>(null);
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
        setCameraError(t("live.camError"));
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
      stopSpeaking();
    };
  }, [stopStream]);

  // Lokalna detekcija — petlja koja se sama odmerava prema kretanju kamere
  useEffect(() => {
    let stopped = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Poređenje kadrova na sličici 32×24: dovoljno da se razlikuje mirna
    // ruka od pomeranja, a dovoljno jeftino da sme da se radi non-stop.
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 24;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    let prev: Uint8ClampedArray | null = null;

    /** Zapamti trenutni kadar kao polaznu tačku, bez ocene kretanja. */
    const reprime = (video: HTMLVideoElement) => {
      if (!pctx) return;
      pctx.drawImage(video, 0, 0, probe.width, probe.height);
      prev = new Uint8ClampedArray(
        pctx.getImageData(0, 0, probe.width, probe.height).data,
      );
    };

    const motion = (video: HTMLVideoElement): number => {
      if (!pctx) return 0;
      pctx.drawImage(video, 0, 0, probe.width, probe.height);
      const now = pctx.getImageData(0, 0, probe.width, probe.height).data;
      if (!prev) {
        prev = new Uint8ClampedArray(now);
        return 999; // prvi kadar: nema sa čim da se poredi
      }
      let sum = 0;
      for (let i = 0; i < now.length; i += 4) {
        sum += Math.abs(now[i] - prev[i]) + Math.abs(now[i + 1] - prev[i + 1]) +
          Math.abs(now[i + 2] - prev[i + 2]);
      }
      prev = new Uint8ClampedArray(now);
      return sum / (now.length / 4) / 3;
    };

    const pass = async (video: HTMLVideoElement, deep: boolean) => {
      setPhase(deep ? "closer" : "looking");
      try {
        const found = await detectLocal(
          video, video.videoWidth, video.videoHeight, ageGroup,
          // Kvadrant SAMO kad ruka miruje: izmereno je da udvostručuje
          // trajanje prolaza (3,3 s → 6,9 s). Dok se kamera kreće to je
          // čist gubitak — kadar se ionako promeni pre nego što se vrati.
          deep ? { quadrant: tickRef.current++ % 4 } : {},
        );
        setModelReady(true);
        setModelFail(null);
        if (!pausedRef.current && !stopped) {
          setLocalHazards(trackerRef.current.update(found, Date.now()));
        }
      } catch (e: any) {
        // Učitavanje modela palo — prikaži razlog umesto večnog "Učitavam…"
        if (modelError) setModelFail(modelError);
        else if (e?.message) setModelFail(e.message);
      }
    };

    (async () => {
      let stillSince = 0;
      let lastPass = 0;
      let deepDone = false;
      while (!stopped) {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0 || pausedRef.current) {
          setPhase("idle");
          await sleep(MOTION_SAMPLE_MS);
          continue;
        }
        const now = Date.now();
        const moving = motion(video) > MOTION_LEVEL;
        if (moving) {
          stillSince = 0;
          deepDone = false;
          setPhase("moving");
        } else if (!stillSince) {
          stillSince = now;
        }

        // Presek stanja: čim ruka stane, pa dublje ako i dalje stoji.
        // Dok se kamera pomera i dalje se povremeno gleda, da roditelj koji
        // stalno šeta kamerom ne ostane bez ijednog nalaza.
        const still = !moving;
        const wantDeep = still && !deepDone && now - stillSince >= STILL_FOR_DEEP_MS;
        const wantQuick = still && now - lastPass >= MOTION_SAMPLE_MS && stillSince === now;
        if (wantDeep || wantQuick || now - lastPass >= MAX_GAP_MS) {
          lastPass = Date.now();
          if (wantDeep) deepDone = true;
          await pass(video, wantDeep);
          lastPass = Date.now();
          // Polazna tačka se OSVEŽAVA, ne briše. Brisanje bi sledeće merenje
          // proglasilo kretanjem, pa bi na potpuno mirnoj slici svaki prolaz
          // odmah pokretao sledeći — model bi radio bez prestanka, a dubinski
          // prolaz nikad ne bi došao na red.
          if (videoRef.current) reprime(videoRef.current);
          continue;
        }
        await sleep(MOTION_SAMPLE_MS);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [ageGroup]);

  // Cloud AI — spora petlja (bogata analiza)
  useEffect(() => {
    const tick = async () => {
      if (cloudBusy.current || pausedRef.current) return;
      // Backoff: posle neuspeha preskoči par otkucaja da ne gušimo besplatne
      // provajdere (rate limit) — pa pokušaj ponovo automatski
      if (cloudSkip.current > 0) {
        cloudSkip.current -= 1;
        return;
      }
      const frame = captureFrame(CLOUD_EDGE);
      if (!frame) return;
      cloudBusy.current = true;
      try {
        const res = await analyzeImage({
          imageDataUrl: frame.dataUrl,
          roomType,
          ageGroup,
          childName,
          live: true,
        });
        cloudFails.current = 0;
        if (!pausedRef.current) {
          setCloudResult(res);
          setCloudError(null);
        }
      } catch {
        // Cloud pad NIJE fatalan — lokalna detekcija nastavlja; korisniku
        // se prikazuje smirena poruka, a pokušaji se proredе automatski
        cloudFails.current += 1;
        cloudSkip.current = Math.min(4, cloudFails.current);
        setCloudError("retry");
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

  // JEDAN FOKUS: grupisano (3 iste stolice = 1) i rangirano po stvarnom
  // riziku za dete. Na ekranu se crta SAMO aktivna opasnost — gomila
  // preklopljenih okvira je debug prikaz, ne korisničko iskustvo.
  const ranked = rankHazards(hazards, ageGroup);
  const count = ranked.length;
  // Fokus prati PREDMET. Ako je predmet izašao iz kadra, pređi na najveći
  // rizik — ali tek tada, ne pri svakom preuređivanju liste.
  const focusIdx = Math.max(0, ranked.findIndex((h) => h.id === focusId));
  const active = ranked[focusIdx] ?? null;
  const topHazard = active;

  // Sesija + glasovna upozorenja na SVAKU novu opasnost
  useEffect(() => {
    for (const h of hazards) {
      // Ključ je PREDMET (kategorija + naziv), ne ispisani naziv. Dok je
      // ograda „Moguće:" stajala u nazivu, ista činija je u izveštaj ulazila
      // dvaput — kao „Činija" i kao „Moguće: Činija".
      const key = `${h.category}|${h.label}`;
      const prev = sessionRef.current.get(key);
      if (!prev && (h.severity === "critical" || h.severity === "high")) {
        // Vibracija na novu ozbiljnu opasnost (Android; iOS ignoriše)
        try {
          (navigator as any).vibrate?.(h.severity === "critical" ? [140, 60, 140] : 90);
        } catch {
          /* ignoriši */
        }
      }
      if (!prev || SEV_ORDER[h.severity] < SEV_ORDER[prev.severity]) {
        sessionRef.current.set(key, h);
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
          `${t("live.alert")} ${hazardName(fresh)}. ${severityLabel(fresh.severity)} ${t("live.risk")}. ${fresh.fix}`,
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
    if (next) speak(t("live.soundOn"));
    else stopSpeaking();
  };

  const goto = (delta: number) => {
    if (count < 2) return;
    setPagerTouched(true);
    setFocusId(ranked[(focusIdx + delta + count) % count].id);
    try {
      (navigator as any).vibrate?.(12);
    } catch {
      /* ignoriši */
    }
  };

  const toggleMode = () => {
    const next = !showAll;
    setShowAll(next);
    try {
      localStorage.setItem("safenest.liveAll", next ? "1" : "0");
    } catch {
      /* ignoriši */
    }
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
          ? `${t("live.sessionDone1")} ${all.length} ${t("live.sessionDone2")}`
          : t("live.sessionNone"),
    };
    onFinish(frame, result);
  };

  const status = cameraError
    ? "⚠️ " + cameraError
    : modelFail
      ? `⚠️ Model: ${modelFail.slice(0, 80)}`
      : !modelReady
        ? t("live.loading")
        : count > 0
          ? `${count} ${count === 1 ? t("live.one") : t("live.many")}`
          : phase === "moving"
            ? t("live.moving")
            : phase === "closer"
              ? t("live.closer")
              : phase === "looking"
                ? t("live.looking")
                : t("live.scanning");

  return (
    <div className="live-wrap" data-phase={phase}>
      <video ref={videoRef} className="live-video" playsInline muted autoPlay />
      {paused && frozenFrame && (
        <img src={frozenFrame} alt="" className="live-video live-frozen" />
      )}

      {/* Prevlačenje prstom menja opasnost u fokusu (kao galerija slika) */}
      {!showAll && count > 1 && !paused && (
        <div
          className="live-swipe"
          onTouchStart={(e) => (swipeX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (swipeX.current === null) return;
            const dx = e.changedTouches[0].clientX - swipeX.current;
            if (Math.abs(dx) > 45) goto(dx < 0 ? 1 : -1);
            swipeX.current = null;
          }}
        />
      )}

      {/* REŽIM „SVE ODJEDNOM": svi okviri, ali samo brojevi — bez tekstualnih
          oznaka koje se preklapaju; naziv nosi aktivni. */}
      {showAll &&
        ranked.map((h, i) => (
          <button
            key={h.id}
            className={`hazard-box live-box${i === focusIdx ? " live-box-active" : " live-box-dim"}`}
            data-sev={h.severity}
            style={{
              left: `${h.box.x * 100}%`,
              top: `${h.box.y * 100}%`,
              width: `${h.box.w * 100}%`,
              height: `${h.box.h * 100}%`,
              borderColor: SEVERITY_META[h.severity].color,
              ["--sev-glow" as string]: `${SEVERITY_META[h.severity].color}66`,
            }}
            onClick={() => {
              setFocusId(h.id);
              setPagerTouched(true);
            }}
            aria-label={hazardName(h)}
          >
            <span
              className="live-pin"
              style={{ background: SEVERITY_META[h.severity].color }}
            >
              {i + 1}
            </span>
            {i === focusIdx && (
              <span className="live-tag live-tag-float">
                <span className="live-tag-name">
                  {CATEGORY_ICONS[h.category]} {hazardName(h)}
                  {h.count > 1 && ` ×${h.count}`}
                </span>
              </span>
            )}
          </button>
        ))}

      {/* REŽIM „JEDNA PO JEDNA": reflektor — ostatak kadra zatamnjen */}
      {!showAll && active && (
        <button
          className="hazard-box live-box live-spot"
          data-sev={active.severity}
          style={{
            left: `${active.box.x * 100}%`,
            top: `${active.box.y * 100}%`,
            width: `${active.box.w * 100}%`,
            height: `${active.box.h * 100}%`,
            borderColor: SEVERITY_META[active.severity].color,
            ["--sev-glow" as string]: `${SEVERITY_META[active.severity].color}66`,
          }}
          onClick={() => pauseOn(active)}
          aria-label={hazardName(active)}
        >
          <span className="live-tag">
            <span
              className="live-tag-num"
              style={{ background: SEVERITY_META[active.severity].color }}
            >
              {focusIdx + 1}
            </span>
            <span className="live-tag-name">
              {CATEGORY_ICONS[active.category]} {hazardName(active)}
              {active.count > 1 && ` ×${active.count}`}
            </span>
            <b
              className="live-tag-sev"
              style={{ color: SEVERITY_META[active.severity].color }}
            >
              {severityLabel(active.severity)}
            </b>
          </span>
        </button>
      )}

      <div className="live-topbar">
        <span className="live-status">
          {!cameraError && !paused && (
            <span
              className="live-dot"
              data-busy={phase === "looking" || phase === "closer" ? "1" : undefined}
            />
          )}
          {status}
        </span>
        <div className="live-topbtns">
          <button
            className={`live-iconbtn${showAll ? " live-iconbtn-on" : ""}`}
            onClick={toggleMode}
            aria-label={t(showAll ? "live.modeAll" : "live.modeOne")}
            title={t(showAll ? "live.modeAll" : "live.modeOne")}
          >
            {showAll ? "▦" : "◎"}
          </button>
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
        <div className="live-cloudnote">{t("live.cloudnote")}</div>
      )}

      {/* Donji stub: listač IZNAD kartice — nikad se ne preklapaju */}
      {topHazard && !paused && (
        <div className="live-bottom">
          {count > 1 && (
            <div className={`pager${pagerTouched ? "" : " pager-hint"}`}>
              <button className="pager-arrow" onClick={() => goto(-1)} aria-label="‹">
                ‹
              </button>
              <div className="pager-dots">
                {ranked.slice(0, 8).map((h, i) => (
                  <button
                    key={h.id}
                    className={`pager-dot${i === focusIdx ? " pager-dot-on" : ""}`}
                    style={
                      i === focusIdx
                        ? { background: SEVERITY_META[h.severity].color }
                        : undefined
                    }
                    onClick={() => {
                      setFocusId(h.id);
                      setPagerTouched(true);
                    }}
                    aria-label={`${i + 1}`}
                  />
                ))}
                {count > 8 && <span className="pager-more">+{count - 8}</span>}
              </div>
              <button className="pager-arrow" onClick={() => goto(1)} aria-label="›">
                ›
              </button>
              <span className="pager-count">
                {focusIdx + 1}/{count}
              </span>
            </div>
          )}

          <button className="live-strip" onClick={() => pauseOn(topHazard)}>
            <span
              className="live-strip-sev"
              style={{ background: SEVERITY_META[topHazard.severity].color }}
            >
              {CATEGORY_ICONS[topHazard.category]} {severityLabel(topHazard.severity)}
            </span>
            <span className="live-strip-body">
              <strong>{hazardName(topHazard)}</strong>
              <span className="live-strip-why">
                {topHazard.contextNote ? `📍 ${topHazard.contextNote} · ` : ""}
                {topHazard.why}
              </span>
              <span className="live-strip-hint">{t("live.tapMore")}</span>
            </span>
          </button>
        </div>
      )}

      <div className="live-bottombar">
        {paused ? (
          <button className="btn btn-primary" onClick={resume}>
            {t("live.resume")}
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
                {t("live.retry")}
              </button>
            )}
            <button className="btn btn-primary btn-finish" onClick={finish}>
              {t("live.finish")}{sessionCount > 0 ? ` (${sessionCount})` : ""}
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
