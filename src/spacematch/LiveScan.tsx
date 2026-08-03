import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeSpace, recommend, track, type Alternative, type Match, type RoomProfile, type Tenant } from "./api";
import { aiLanguage, getLang, t } from "./i18n";
import { lightName, objectName, roomName, styleName } from "./labels";
import {
  keepUseful, loadDetector, localProfile, paletteFrom, signature,
  type Seen,
} from "./vision";
import { recognise, remember } from "../lib/roomMemory";

interface Props {
  tenant: Tenant;
  onClose: () => void;
  /** Kupac je stao na jednom predlogu — dalje ide pregled na zidu i upit. */
  onPick: (frame: string, profile: RoomProfile, matches: Match[], alts: Alternative[]) => void;
}

/** Kadar se obrađuje tek kada je telefon miran — mutna slika laže meru. */
const STILL_LIMIT = 7.5;
/** Najmanji razmak između dva dubinska (oblak) pogleda na isti prostor. */
const CLOUD_GAP_MS = 5000;
/** Detekcija ide oko pet puta u sekundi; više ne vidi oko, a greje telefon. */
const DETECT_GAP_MS = 190;
/** Slab uređaj: ako prolaz traje ovoliko, lokalni vid se gasi. */
const TOO_SLOW_MS = 1400;
/** Koliko čekamo model pre nego što nastavimo bez njega. */
const MODEL_WAIT_MS = 20000;

/**
 * Skeniranje UŽIVO sa YOLO-om koji već koristimo u SafeNest-u.
 *
 * Podela posla:
 *   • YOLO u telefonu — trenutno, besplatno, i bez mreže: šta je u kadru,
 *     kolika je prostorija, gde je prazan zid. Odatle prve preporuke stižu
 *     pre nego što bi ijedan mrežni poziv i počeo.
 *   • Oblak — kada se telefon smiri: stil, raspoloženje, tačna paleta.
 *     Preporuke se tada dotere, ali kupac nikad ne gleda prazan ekran.
 */
export function LiveScan({ tenant, onClose, onPick }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement>(null);
  const model = useRef<any>(null);
  const prevPix = useRef<Uint8ClampedArray | null>(null);
  const lastDetect = useRef(0);
  const lastCloud = useRef(0);
  const lastSig = useRef("");
  const detecting = useRef(false);
  const cloudBusy = useRef(false);
  const localBusy = useRef(false);
  const stopped = useRef(false);
  const seenRef = useRef<Seen[]>([]);
  // Petlja čita ove vrednosti bez ponovnog pokretanja efekta
  const steadyRef = useRef(false);
  const refinedRef = useRef(false);
  const cloudSig = useRef("");
  const slow = useRef(0);
  const loadingRef = useRef(true);

  const [ready, setReady] = useState(false);
  const [loadingModel, setLoadingModel] = useState(true);
  const [err, setErr] = useState("");
  const [steady, setSteady] = useState(false);
  const [deep, setDeep] = useState(false);
  const [profile, setProfile] = useState<RoomProfile | null>(null);
  /** Otisak prostora iz poslednjeg kadra — po njemu se soba pamti i prepoznaje. */
  const lastPrint = useRef<{ objects: string[]; palette: string[] } | null>(null);
  /** Pre koliko dana smo ovaj prostor već videli; null = prvi put. */
  const [seenBefore, setSeenBefore] = useState<number | null>(null);
  const [refined, setRefined] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [alts, setAlts] = useState<Alternative[]>([]);
  const [frame, setFrame] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  // Dok model još ništa ne vidi, uglovi kadra vode oko; čim krenu okviri,
  // vođica se sklanja da ne bi bilo dve stvari koje traže pažnju.
  const [anySeen, setAnySeen] = useState(false);

  /* ---------------------------------------------------- kamera i model */
  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped.current) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
        setReady(true);
        track(tenant.slug, "live_open");
      } catch (e: any) {
        setErr(e?.name === "NotAllowedError" ? t("lv.denied") : t("lv.nocam"));
        setLoadingModel(false);
        return;
      }
      try {
        // Star telefon ume da učitava model predugo — ne držimo kupca da
        // čeka, nego posle ovog roka nastavljamo samo sa oblakom.
        model.current = await Promise.race([
          loadDetector(),
          new Promise((_, no) => setTimeout(() => no(new Error("slow")), MODEL_WAIT_MS)),
        ]);
      } catch {
        // Bez lokalnog vida i dalje radi — samo bez okvira i bez trenutnih
        // predloga; oblak preuzima ceo posao.
        model.current = null;
      } finally {
        if (!stopped.current) setLoadingModel(false);
      }
    })();
    return () => {
      stopped.current = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [tenant.slug]);

  /* ------------------------------------ preporuke iz lokalnog profila */
  const askLocal = useCallback(
    async (p: RoomProfile) => {
      if (localBusy.current) return;
      localBusy.current = true;
      try {
        const r = await recommend(tenant.slug, p, {}, getLang());
        if (stopped.current) return;
        setMatches(r.recommendations);
        setAlts(r.alternatives);
        setCount((n) => n + 1);
      } catch {
        /* katalog trenutno nedostupan — sledeći pokušaj za koji trenutak */
      } finally {
        localBusy.current = false;
      }
    },
    [tenant.slug],
  );

  /* ------------------------------------- dubinski pogled preko oblaka */
  const askCloud = useCallback(
    async (jpeg: string, local: RoomProfile) => {
      cloudBusy.current = true;
      setDeep(true);
      try {
        const p = await analyzeSpace(tenant.slug, jpeg, aiLanguage(), true);
        if (stopped.current) return;
        // Mera iz lokalnog vida je pouzdanija od procene na slici kada je
        // u kadru poznat predmet, pa se zadržava.
        const merged: RoomProfile = {
          ...p,
          wallWidth: local.confidence > 0.3 ? local.wallWidth : p.wallWidth,
          focalPoint: local.focalPoint,
          roomType: p.confidence >= local.confidence ? p.roomType : local.roomType,
        };
        setProfile(merged);
        setRefined(true);
        setFrame(jpeg);
        // Ono što je oblak pročitao vredi zapamtiti: sledeći put se isti
        // prostor prepozna iz same slike, bez ponovnog čitanja.
        if (lastPrint.current) remember(lastPrint.current, { profile: merged });
        const r = await recommend(tenant.slug, merged, {}, getLang());
        if (stopped.current) return;
        setMatches(r.recommendations);
        setAlts(r.alternatives);
        setCount((n) => n + 1);
      } catch {
        /* promašen kadar nije greška — lokalni predlozi ostaju na ekranu */
      } finally {
        cloudBusy.current = false;
        lastCloud.current = Date.now();
        setDeep(false);
      }
    },
    [tenant.slug],
  );

  /* ------------------------------------------------------- glavna petlja */
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const w = work.current!;
    const wctx = w.getContext("2d", { willReadFrequently: true })!;

    const draw = (seen: Seen[], vw: number, vh: number) => {
      const cv = overlay.current;
      const v = video.current;
      if (!cv || !v) return;
      const rect = v.getBoundingClientRect();
      if (cv.width !== Math.round(rect.width) || cv.height !== Math.round(rect.height)) {
        cv.width = Math.round(rect.width);
        cv.height = Math.round(rect.height);
      }
      const ctx = cv.getContext("2d")!;
      ctx.clearRect(0, 0, cv.width, cv.height);

      // Video je object-fit: cover — okviri moraju da prate isti isečak
      const scale = Math.max(cv.width / vw, cv.height / vh);
      const offX = (cv.width - vw * scale) / 2;
      const offY = (cv.height - vh * scale) / 2;

      ctx.lineWidth = 2;
      ctx.font = "600 12px Inter Variable, system-ui, sans-serif";
      for (const s of seen) {
        if (s.hidden) continue;
        const x = s.box[0] * scale + offX;
        const y = s.box[1] * scale + offY;
        const bw = s.box[2] * scale;
        const bh = s.box[3] * scale;

        ctx.strokeStyle = "rgba(255,255,255,.92)";
        ctx.shadowColor = "rgba(0,0,0,.45)";
        ctx.shadowBlur = 6;
        roundRect(ctx, x, y, bw, bh, 10);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const label = `${objectName(s.label)} ${Math.round(s.score * 100)}%`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(15,118,110,.94)";
        roundRect(ctx, x, Math.max(0, y - 22), tw + 16, 20, 6);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + 8, Math.max(0, y - 22) + 14);
      }
    };

    const tick = async () => {
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (!v || v.readyState < 2) return;
      const vw = v.videoWidth || 1280;
      const vh = v.videoHeight || 720;

      // Merenje pokreta na sitnoj kopiji — jeftino i dovoljno precizno
      w.width = 64;
      w.height = 48;
      wctx.drawImage(v, 0, 0, 64, 48);
      const pix = wctx.getImageData(0, 0, 64, 48).data;
      if (prevPix.current) {
        let diff = 0;
        for (let i = 0; i < pix.length; i += 16) diff += Math.abs(pix[i] - prevPix.current[i]);
        setSteady(diff / (pix.length / 16) < STILL_LIMIT);
      }
      const palette = paletteFrom(wctx, 64, 48);
      prevPix.current = pix;

      const now = Date.now();

      // Bez lokalnog vida (star uređaj ili model nije stigao) sve nosi oblak
      if (!model.current && !loadingRef.current) {
        if (steadyRef.current && !cloudBusy.current && now - lastCloud.current > CLOUD_GAP_MS) {
          const shot = document.createElement("canvas");
          const k = Math.min(1, 1024 / Math.max(vw, vh));
          shot.width = Math.round(vw * k);
          shot.height = Math.round(vh * k);
          shot.getContext("2d")!.drawImage(v, 0, 0, shot.width, shot.height);
          void askCloud(shot.toDataURL("image/jpeg", 0.78), localProfile([], vw, vh, palette));
        }
        return;
      }

      if (model.current && !detecting.current && now - lastDetect.current > DETECT_GAP_MS) {
        detecting.current = true;
        lastDetect.current = now;
        const t0 = performance.now();
        try {
          const preds = await model.current.detect(v, 20, 0.3);
          if (stopped.current) return;
          // Ako uređaj ne stiže, radije nema okvira nego da kamera štuca
          const took = performance.now() - t0;
          slow.current = took > TOO_SLOW_MS ? slow.current + 1 : 0;
          if (slow.current >= 3) {
            model.current = null;
            overlay.current?.getContext("2d")?.clearRect(0, 0, overlay.current.width, overlay.current.height);
            return;
          }
          const seen = keepUseful(preds);
          seenRef.current = seen;
          setAnySeen(seen.some((x) => !x.hidden));
          draw(seen, vw, vh);

          const sig = signature(seen);
          const local = localProfile(seen, vw, vh, palette);
          // Nova postavka scene → odmah nove preporuke, bez mreže za sliku
          if (sig && sig !== lastSig.current) {
            lastSig.current = sig;
            setProfile((old) => (old && refinedRef.current ? { ...old, focalPoint: local.focalPoint } : local));
            setRefined(false);
            void askLocal(local);

            // Prostor koji smo već videli ne treba čitati iznova. Stil i
            // raspoloženje su ostali isti — vraćaju se odmah, pa kupac koji
            // se vratio ne čeka drugi put ono što je jednom već sačekao.
            const print = { objects: seen.filter((x) => !x.hidden).map((x) => x.label), palette };
            const known = recognise(print);
            const saved = known?.room.data?.profile as RoomProfile | undefined;
            if (saved && !refinedRef.current) {
              setProfile({ ...saved, focalPoint: local.focalPoint, wallWidth: local.wallWidth });
              setRefined(true);
              setSeenBefore(known!.daysAgo);
            }
            lastPrint.current = print;
          }

          // Miran kadar → dubinski pogled koji dodaje stil i raspoloženje
          if (
            steadyRef.current &&
            !cloudBusy.current &&
            now - lastCloud.current > CLOUD_GAP_MS &&
            (!refinedRef.current || sig !== cloudSig.current)
          ) {
            cloudSig.current = sig;
            const shot = document.createElement("canvas");
            const k = Math.min(1, 1024 / Math.max(vw, vh));
            shot.width = Math.round(vw * k);
            shot.height = Math.round(vh * k);
            shot.getContext("2d")!.drawImage(v, 0, 0, shot.width, shot.height);
            void askCloud(shot.toDataURL("image/jpeg", 0.78), local);
          }
        } catch {
          /* jedan promašen prolaz ne ruši petlju */
        } finally {
          detecting.current = false;
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, askLocal, askCloud]);

  steadyRef.current = steady;
  refinedRef.current = refined;
  loadingRef.current = loadingModel;

  const state = deep ? t("lv.deep") : loadingModel ? t("lv.loading") : steady ? t("lv.hold") : t("lv.move");

  return (
    <div className="lv">
      <video ref={video} className="lv-video" playsInline muted autoPlay />
      <canvas ref={overlay} className="lv-overlay" />
      <canvas ref={work} hidden />

      {!anySeen && (
        <div className="lv-frame" aria-hidden="true">
          <i /><i /><i /><i />
        </div>
      )}

      <header className="lv-top">
        <span className="lv-brand">
          {tenant.logo_url ? <img src={tenant.logo_url} alt="" /> : <b>{tenant.name.slice(0, 2).toUpperCase()}</b>}
          {tenant.name}
        </span>
        <button className="lv-x" onClick={onClose} aria-label={t("lv.stop")}>✕</button>
      </header>

      <div className={`lv-state${deep || loadingModel ? " on" : ""}`}>
        <span className="lv-pulse" />
        {state}
      </div>

      {err && (
        <div className="lv-err">
          <p>{err}</p>
          <button className="sm-btn sm-btn-quiet" onClick={onClose}>{t("lv.usePhoto")}</button>
        </div>
      )}

      {seenBefore !== null && (
        <div className="ls-known">
          {seenBefore === 0 ? t("mem.today") : t("mem.days").replace("{n}", String(seenBefore))}
        </div>
      )}
      {profile && (
        <div className="lv-tags" key={count}>
          <span>{roomName(profile.roomType)}</span>
          {refined && <span>{styleName(profile.style)}</span>}
          {refined && <span>{lightName(profile.lighting)}</span>}
          <span>{Math.round(profile.wallWidth)} cm</span>
        </div>
      )}

      {matches.length > 0 && (
        <div className="lv-dock">
          <div className="lv-row">
            {matches.map((m, i) => (
              <button
                key={m.id}
                className={`lv-card${i === 0 ? " lv-card-lead" : ""}`}
                onClick={() => pickOne(m)}
              >
                {m.image_url ? <img src={m.image_url} alt="" /> : <span className="lv-ph" />}
                <span className="lv-card-t">
                  <b>{m.title}</b>
                  <span>{m.match}% {t("s.match")}</span>
                </span>
              </button>
            ))}
          </div>
          <button className="sm-btn sm-btn-accent sm-btn-block" onClick={() => pickOne(matches[0])}>
            {t("lv.freeze")}
          </button>
        </div>
      )}
    </div>
  );

  /** Zamrzni trenutni kadar i pređi na isti ekran rezultata kao za sliku. */
  function pickOne(m: Match) {
    const v = video.current;
    if (!v || !profile) return;
    let shot = frame;
    if (!shot) {
      const c = document.createElement("canvas");
      const vw = v.videoWidth || 1280;
      const vh = v.videoHeight || 720;
      const k = Math.min(1, 1024 / Math.max(vw, vh));
      c.width = Math.round(vw * k);
      c.height = Math.round(vh * k);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      shot = c.toDataURL("image/jpeg", 0.82);
    }
    onPick(shot, profile, [m, ...matches.filter((x) => x.id !== m.id)], alts);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
