import { useEffect, useRef, useState } from "react";
import { t } from "./i18n";
import { FLAT, estimatePlane, pieceTransform, planePerspective, type Plane } from "./plane";
import { cutoutFrom, type Cutout } from "../lib/cutout";
import { Piece3D } from "./Piece3D";
import { estimateDepth, type DepthMap } from "../lib/depth";
import type { Match, RoomProfile } from "./api";

interface Props {
  room: string;
  piece: Match;
  profile: RoomProfile;
}

/**
 * Koliko nešto mora biti bliže od predmeta da bi ga zaklonilo.
 *
 * Pod tik ispred predmeta je uvek malo bliži od njega samog; bez zazora bi
 * predmet ostao bez nogu. Izmereno na mapi 0–1: nameštaj ispred je 0,15–0,4
 * bliži, a pod uz samu nogu manje od 0,05.
 */
const SLACK = 0.08;

const FRAMES = [
  { id: "thin", cls: "sm-piece-thin", key: "fr.thin" },
  { id: "wide", cls: "sm-piece-wide", key: "fr.wide" },
  { id: "dark", cls: "sm-piece-dark", key: "fr.dark" },
  { id: "none", cls: "", key: "fr.none" },
] as const;

/**
 * Pregled komada na kupčevom zidu. Namerno bez WebXR-a i bez biblioteka:
 * fotografija, razmera izračunata iz procenjene širine zida i ravan zida
 * procenjena iz same slike daju realan osećaj veličine na svakom telefonu,
 * bez ijedne dozvole i bez čekanja.
 */
export function WallPreview({ room, piece, profile }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<(typeof FRAMES)[number]["id"]>("thin");
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: profile.focalPoint.x + profile.focalPoint.w / 2, y: profile.focalPoint.y + profile.focalPoint.h / 2 });
  const drag = useRef<{ active: boolean }>({ active: false });
  // Ravan zida se računa jednom po fotografiji; komad se posle samo pomera.
  const [plane, setPlane] = useState<Plane>(FLAT);
  const [boxW, setBoxW] = useState(0);
  /**
   * Komad izrezan iz svoje fotografije.
   *
   * Tepih, lampa i fotelja nemaju ram — u pravougaoniku sa belom pozadinom
   * izgledaju kao nalepnica preko sobe. Kad se pozadina da ukloniti, predmet
   * stoji u prostoru; kad ne može, ostaje dosadašnji prikaz sa ramom, koji
   * je za uramljene radove ionako tačan.
   */
  const [cut, setCut] = useState<Cutout | null>(null);
  /**
   * Okret predmeta oko uspravne ose.
   *
   * Kreće od nagiba zida procenjenog iz same fotografije, pa predmet odmah
   * stoji po istom uglu kao soba — kupac ne mora ništa da namešta da bi mu
   * izgledalo tačno. Odatle ga dalje okreće sam.
   */
  const [yaw, setYaw] = useState(0);
  /** Da li 3D zaista radi na ovom uređaju. Dok ne znamo, stoji izrezana slika. */
  const [space, setSpace] = useState(false);
  /**
   * Dubina sobe sa fotografije.
   *
   * Odavde dolaze dve stvari koje se odmah vide: predmet ide IZA onoga što
   * je ispred njega, i menja veličinu kad ga kupac spusti dublje u sobu.
   * Meri se jednom po fotografiji i tek kad se pregled otvori — na
   * skeniranje ne pada ni bajt.
   */
  const [depth, setDepth] = useState<DepthMap | null>(null);
  const [grey, setGrey] = useState<Uint8Array | null>(null);

  // Prava razmera: širina komada / procenjena širina zida u kadru.
  const pieceW = Number(piece.width_cm) || 90;
  const pieceH = Number(piece.height_cm) || 120;
  const wallW = profile.wallWidth || 300;

  /**
   * Koliko je predmet daleko, i koliko se zato smanjuje.
   *
   * Procenjena širina zida važi na dubini žižne tačke — tamo gde je i
   * merena. Kad kupac spusti predmet dublje u sobu, on mora da bude manji,
   * a bliže sebi veći.
   *
   * Odnos blizina je tačan zakon, ali je mera iz modela relativna, pa se
   * koren uzima kao prigušenje i množilac se drži u granicama: bolje malo
   * premalo nego lampa visoka kao vrata. U polaznom položaju je tačno 1 —
   * ništa se ne menja dok kupac sam ne pomeri predmet.
   */
  const refNear = depth
    ? depth.at(profile.focalPoint.x + profile.focalPoint.w / 2,
               profile.focalPoint.y + profile.focalPoint.h / 2)
    : 0;
  const hereNear = depth ? depth.at(pos.x, pos.y) : 0;
  const away = depth && refNear > 0.02 && hereNear > 0.02
    ? Math.max(0.6, Math.min(1.7, Math.sqrt(hereNear / refNear)))
    : 1;

  const widthPct = Math.max(4, Math.min(96, (pieceW / wallW) * 100 * scale * away));
  const aspect = pieceH / pieceW;
  /** Predmet bez rama: kad se pozadina uspešno uklonila, stoji sam u prostoru. */
  const solid = Boolean(cut?.ok);
  /** Pravi predmet: model postoji I grafika u ovom pregledaču radi. */
  const real = Boolean(piece.model_url) && space;

  useEffect(() => {
    setPos({ x: profile.focalPoint.x + profile.focalPoint.w / 2, y: profile.focalPoint.y + profile.focalPoint.h / 2 });
    setScale(1);
    setSpace(false);
  }, [piece.id, profile.focalPoint.x, profile.focalPoint.y, profile.focalPoint.w, profile.focalPoint.h]);

  // Dubina se meri samo kad predmet ima svoj model — inače nema ko da je
  // koristi, a merenje traje oko sekund.
  useEffect(() => {
    if (!piece.model_url) return;
    let alive = true;
    setDepth(null);
    setGrey(null);
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = async () => {
      const map = await estimateDepth(el);
      if (!alive || !map) return;
      setDepth(map);
      setGrey(map.grey());
    };
    el.src = room;
    return () => {
      alive = false;
      el.onload = null;
    };
  }, [room, piece.model_url]);

  useEffect(() => {
    setPlane(FLAT);
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => {
      const p = estimatePlane(el);
      setPlane(p);
      // Nagib zida je već u stepenima; predmet kreće od njega.
      setYaw(Math.round(p.yaw));
    };
    el.src = room;
    return () => {
      el.onload = null;
    };
  }, [room]);

  // Perspektiva mora biti u pikselima okvira, pa pratimo njegovu širinu.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setBoxW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    setCut(null);
    if (piece.image_url) cutoutFrom(piece.image_url).then((c) => alive && setCut(c));
    return () => {
      alive = false;
    };
  }, [piece.image_url]);

  const move = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(0.03, Math.min(0.97, (clientX - r.left) / r.width)),
      y: Math.max(0.03, Math.min(0.97, (clientY - r.top) / r.height)),
    });
  };

  return (
    <div className="sm-rise">
      <div
        className="sm-preview"
        ref={wrapRef}
        style={{ perspective: planePerspective(plane, boxW) }}
        onPointerDown={(e) => {
          drag.current.active = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => drag.current.active && move(e.clientX, e.clientY)}
        onPointerUp={() => (drag.current.active = false)}
        onPointerCancel={() => (drag.current.active = false)}
      >
        <img src={room} alt="" className="sm-room" />

        {/* Model se crta iznad fotografije, van CSS perspektive okvira:
            njegov ugao nosi sam predmet, ne omotač. Kad grafika ne radi,
            javi `fail` i ispod ostaje izrezana slika. */}
        {piece.model_url && (
          <Piece3D
            src={piece.model_url}
            x={pos.x}
            y={pos.y}
            widthPct={widthPct}
            yaw={yaw}
            pitch={plane.pitch}
            scene={grey && depth
              ? { grey, w: depth.w, h: depth.h, placed: hereNear, slack: SLACK }
              : null}
            onState={(st) => setSpace(st === "ready")}
          />
        )}

        <div
          className={`sm-piece${solid ? " sm-piece-solid" : ` ${FRAMES.find((f) => f.id === frame)!.cls}`}`}
          style={{
            visibility: real ? "hidden" : "visible",
            width: `${widthPct}%`,
            left: `${pos.x * 100}%`,
            top: `${pos.y * 100}%`,
            transform: pieceTransform(plane),
          }}
        >
          {solid ? (
            <img
              src={cut!.url}
              alt=""
              style={{
                // Predmet retko stoji po sredini svoje fotografije, pa se
                // centrira po svom okviru, a ne po okviru fajla.
                aspectRatio: `${cut!.box.w} / ${cut!.box.h}`,
                objectFit: "cover",
                objectPosition: `${cut!.box.x * -100}% ${cut!.box.y * -100}%`,
              }}
            />
          ) : piece.image_url ? (
            <img src={piece.image_url} alt="" style={{ aspectRatio: `1 / ${aspect}` }} />
          ) : (
            <div style={{ aspectRatio: `1 / ${aspect}`, background: "#cbd5e1" }} />
          )}
        </div>
      </div>

      {!solid && !real && (
      <div className="sm-preview-bar">
        <span className="sm-fact" style={{ padding: "7px 12px", borderRadius: 999 }}>
          {t("s.frame")}
        </span>
        {FRAMES.map((f) => (
          <button
            key={f.id}
            className={`sm-chip${frame === f.id ? " sm-chip-on" : ""}`}
            onClick={() => setFrame(f.id)}
          >
            {t(f.key)}
          </button>
        ))}
      </div>
      )}

      {real && (
        <div className="sm-preview-bar">
          <span className="sm-fact" style={{ padding: "7px 12px", borderRadius: 999 }}>
            {t("s.turn")}
          </span>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
            style={{ flex: 1, minWidth: 140, padding: 0, border: "none", background: "none" }}
            aria-label={t("s.turn")}
          />
          <b style={{ fontSize: "0.85rem" }}>{yaw}°</b>
        </div>
      )}

      <div className="sm-preview-bar">
        <span className="sm-fact" style={{ padding: "7px 12px", borderRadius: 999 }}>
          {t("s.scale")}
        </span>
        <input
          type="range"
          min={0.5}
          max={1.8}
          step={0.02}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          style={{ flex: 1, minWidth: 140, padding: 0, border: "none", background: "none" }}
          aria-label={t("s.scale")}
        />
        <b style={{ fontSize: "0.85rem" }}>
          {Math.round(pieceW * scale)} × {Math.round(pieceH * scale)} cm
        </b>
      </div>

      <p className="sm-preview-hint">
        {t("s.wall")}: ~{Math.round(wallW)} cm · {t("s.drag")}
        {plane.confidence > 0 && ` · ${t("s.angled")}`}
        {real && ` · ${t("s.real3d")}`}
        {real && depth && ` · ${t("s.depth")}`}
      </p>
    </div>
  );
}
