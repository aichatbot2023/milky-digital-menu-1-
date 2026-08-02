import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeSpace, recommend, track, type Alternative, type Match, type RoomProfile, type Tenant } from "./api";
import { aiLanguage, getLang, t } from "./i18n";

interface Props {
  tenant: Tenant;
  onClose: () => void;
  /** Kupac je stao na jednom predlogu — dalje ide pregled na zidu i upit. */
  onPick: (frame: string, profile: RoomProfile, matches: Match[], alts: Alternative[]) => void;
}

/** Uzorkuje se tek kada je kadar miran — mutna slika daje pogrešan savet. */
const STILL_LIMIT = 7.5;
const MIN_GAP_MS = 3800;

/**
 * Skeniranje UŽIVO: kupac šeta telefonom po prostoriji, a predlozi se
 * menjaju sami. Ne šalje se svaki kadar — to bi bilo sporo i skupo po
 * kvoti. Kadar ide na obradu samo kada se telefon smiri i kada se slika
 * stvarno promenila u odnosu na prethodni uzorak.
 */
export function LiveScan({ tenant, onClose, onPick }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const prev = useRef<Uint8ClampedArray | null>(null);
  const busy = useRef(false);
  const lastAt = useRef(0);
  const stopped = useRef(false);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [steady, setSteady] = useState(false);
  const [reading, setReading] = useState(false);
  const [profile, setProfile] = useState<RoomProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [alts, setAlts] = useState<Alternative[]>([]);
  const [frame, setFrame] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  /* ---------------------------------------------------------- kamera */
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
      }
    })();
    return () => {
      stopped.current = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [tenant.slug]);

  /* ------------------------------------------------- obrada jednog kadra */
  const sample = useCallback(
    async (jpeg: string) => {
      busy.current = true;
      setReading(true);
      try {
        const p = await analyzeSpace(tenant.slug, jpeg, aiLanguage(), true);
        if (stopped.current) return;
        setProfile(p);
        setFrame(jpeg);
        const r = await recommend(tenant.slug, p, {}, getLang());
        if (stopped.current) return;
        setMatches(r.recommendations);
        setAlts(r.alternatives);
        setRound((n) => n + 1);
      } catch {
        /* jedan promašen kadar nije greška — sledeći ide za par sekundi */
      } finally {
        busy.current = false;
        lastAt.current = Date.now();
        setReading(false);
      }
    },
    [tenant.slug],
  );

  /* ------------------------------------------- petlja: mirnoća i promena */
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const c = canvas.current!;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (!v || v.readyState < 2) return;

      // Sitna kopija kadra dovoljna je za merenje pokreta
      c.width = 64;
      c.height = 48;
      ctx.drawImage(v, 0, 0, 64, 48);
      const now = ctx.getImageData(0, 0, 64, 48).data;

      if (prev.current) {
        let diff = 0;
        for (let i = 0; i < now.length; i += 16) diff += Math.abs(now[i] - prev.current[i]);
        const motion = diff / (now.length / 16);
        const still = motion < STILL_LIMIT;
        setSteady(still);

        const waited = Date.now() - lastAt.current > MIN_GAP_MS;
        // Prvi uzorak ide čim se telefon smiri; svaki sledeći traži i da se
        // kadar zaista promenio, da ne trošimo kvotu na isti zid.
        const changed = !prev.current || motion > 1.2 || matches.length === 0;
        if (still && waited && changed && !busy.current) {
          const full = document.createElement("canvas");
          const w = v.videoWidth || 1280;
          const h = v.videoHeight || 720;
          const scale = Math.min(1, 1024 / Math.max(w, h));
          full.width = Math.round(w * scale);
          full.height = Math.round(h * scale);
          full.getContext("2d")!.drawImage(v, 0, 0, full.width, full.height);
          void sample(full.toDataURL("image/jpeg", 0.78));
        }
      }
      prev.current = now;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, sample, matches.length]);

  const top = matches[0];

  return (
    <div className="lv">
      <video ref={video} className="lv-video" playsInline muted autoPlay />
      <canvas ref={canvas} hidden />

      <div className="lv-frame" aria-hidden="true">
        <i /><i /><i /><i />
      </div>

      <header className="lv-top">
        <span className="lv-brand">
          {tenant.logo_url ? <img src={tenant.logo_url} alt="" /> : <b>{tenant.name.slice(0, 2).toUpperCase()}</b>}
          {tenant.name}
        </span>
        <button className="lv-x" onClick={onClose} aria-label={t("lv.stop")}>✕</button>
      </header>

      <div className={`lv-state${reading ? " on" : ""}`}>
        <span className="lv-pulse" />
        {reading ? t("lv.reading") : steady ? t("lv.hold") : t("lv.move")}
      </div>

      {err && (
        <div className="lv-err">
          <p>{err}</p>
          <button className="sm-btn sm-btn-quiet" onClick={onClose}>{t("lv.usePhoto")}</button>
        </div>
      )}

      {profile && (
        <div className="lv-tags" key={round}>
          <span>{profile.style}</span>
          <span>{profile.lighting}</span>
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
                onClick={() => frame && profile && onPick(frame, profile, [m, ...matches.filter((x) => x.id !== m.id)], alts)}
              >
                {m.image_url ? <img src={m.image_url} alt="" /> : <span className="lv-ph" />}
                <span className="lv-card-t">
                  <b>{m.title}</b>
                  <span>{m.match}% {t("s.match")}</span>
                </span>
              </button>
            ))}
          </div>
          {top && frame && profile && (
            <button
              className="sm-btn sm-btn-accent sm-btn-block"
              onClick={() => onPick(frame, profile, matches, alts)}
            >
              {t("lv.freeze")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
