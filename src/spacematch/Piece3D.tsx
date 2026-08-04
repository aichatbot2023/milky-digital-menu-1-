import { useEffect, useRef, useState } from "react";
import { Stage, loadGlb, type Model } from "../lib/glb";

interface Props {
  /** Adresa GLB-a proizvoda. */
  src: string;
  /** Središte predmeta u okviru, 0–1. */
  x: number;
  y: number;
  /** Prava širina predmeta, u procentima širine okvira. */
  widthPct: number;
  /** Okret oko uspravne ose i nagib, u stepenima. */
  yaw: number;
  pitch?: number;
  /** Zatamnjenje: soba na fotografiji je skoro uvek tamnija od studijske slike. */
  shade?: number;
  onState?: (state: "loading" | "ready" | "fail") => void;
}

/**
 * Model je isti za sve kupce i ne menja se — jednom učitan ostaje u memoriji
 * stranice. Kupac koji prelazi sa proizvoda na proizvod i natrag ne čeka
 * drugi put ono što je jednom sačekao.
 */
const cache = new Map<string, Promise<Model | null>>();

function fetchModel(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = loadGlb(url);
    cache.set(url, p);
  }
  return p;
}

/**
 * Proizvod kao pravi predmet u kupčevoj sobi.
 *
 * Stoji iznad fotografije ili iznad slike sa kamere, u svojoj stvarnoj
 * veličini, i okreće se — kupac ga vidi iz svog ugla, a ne kao nalepnicu.
 *
 * Kad grafika u pregledaču ne radi ili model nije stigao, komponenta ne
 * prikazuje ništa i javlja `fail`; pozivalac tada ostaje na izrezanoj slici,
 * koja i dalje radi svuda. Nema ekrana sa greškom.
 */
export function Piece3D({ src, x, y, widthPct, yaw, pitch = 0, shade = 0.94, onState }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<Stage | null>(null);
  const model = useRef<Model | null>(null);
  const [ready, setReady] = useState(false);
  const say = useRef(onState);
  say.current = onState;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const s = new Stage(el);
    if (!s.ok) {
      say.current?.("fail");
      return;
    }
    stage.current = s;
    return () => {
      s.dispose();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setReady(false);
    model.current = null;
    say.current?.("loading");
    fetchModel(src).then((m) => {
      if (!alive) return;
      model.current = m;
      setReady(!!m);
      say.current?.(m ? "ready" : "fail");
    });
    return () => {
      alive = false;
    };
  }, [src]);

  // Crta se samo kad se nešto promeni. Ispod je video koji teče, ali predmet
  // stoji tamo gde je postavljen, pa nema razloga da se crta na svaki kadar —
  // to bi telefon grejalo bez ijedne vidljive razlike.
  useEffect(() => {
    const s = stage.current;
    const m = model.current;
    const el = canvas.current;
    if (!s || !m || !el || !ready) return;

    const paint = () => {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      s.clear();
      s.draw(m, {
        x: x * box.width,
        y: y * box.height,
        // Model je normalizovan na svoj okvir; prava veličina dolazi odavde.
        scale: ((widthPct / 100) * box.width) / (m.size[0] || 1),
        yaw: (yaw * Math.PI) / 180,
        pitch: (pitch * Math.PI) / 180,
        shade,
      });
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, x, y, widthPct, yaw, pitch, shade]);

  return <canvas ref={canvas} className="sm-3d" aria-hidden="true" />;
}
