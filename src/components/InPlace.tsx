import { useEffect, useRef, useState } from "react";
import type { Hazard } from "../types";
import { t } from "../lib/i18n";
import { cutoutFrom, type Cutout } from "../lib/cutout";
import { estimatePlane, pieceTransform, planePerspective, FLAT, type Plane } from "../spacematch/plane";
import { depthIn, estimateDepth, maskBehind } from "../lib/depth";

interface Props {
  /** Fotografija koju je roditelj upravo skenirao. */
  photo: string;
  hazard: Hazard;
  /** Rešenje koje predlažemo — naziv i slika iz prodavnice. */
  product: { title: string; image_url?: string | null };
}

/**
 * Tipične stvarne širine, u centimetrima.
 *
 * Bez njih se rešenje ne može prikazati u pravoj veličini. Brojevi su
 * namerno grubi: cilj nije katalog nego da zaštita za utičnicu ne ispadne
 * veličine kauča.
 */
const CM_BY_CATEGORY: Record<string, number> = {
  electric: 9,
  fall: 76,
  choking: 8,
  poisoning: 10,
  burn: 60,
  cutting: 12,
  drowning: 30,
  crush: 7,
  strangulation: 8,
  other: 15,
};

/** Šta rešenje jeste, prepoznato iz naziva — tačnije od same kategorije. */
const CM_BY_WORD: [RegExp, number][] = [
  [/\b(gate|barrier|kapij|ograd)\b/i, 76],
  [/\b(stove|hob|oven|guard|šporet|rern)\b/i, 60],
  [/\b(strap|anchor|kais|sidr)\b/i, 30],
  [/\b(corner|edge|ugao|ivic)\b/i, 5],
  [/\b(socket|outlet|plug|utičnic|utikač)\b/i, 9],
  [/\b(lock|latch|brav|reza)\b/i, 7],
  [/\b(cord|blind|winder|gajtan|rolet)\b/i, 6],
  [/\b(cover|poklop)\b/i, 9],
];

/**
 * Koliko nešto mora biti bliže od opasnosti da bi je zaklonilo.
 *
 * Pod i zid tik uz samu opasnost su uvek za dlaku bliži; bez zazora bi
 * rešenje ostalo bez ivica. Isti broj kao u pregledu prostora — merilo je
 * ista mapa.
 */
const SLACK = 0.08;

const realWidth = (title: string, category: string) => {
  for (const [re, cm] of CM_BY_WORD) if (re.test(title)) return cm;
  return CM_BY_CATEGORY[category] ?? 15;
};

/**
 * Rešenje postavljeno tačno tamo gde je opasnost.
 *
 * Spisak proizvoda ispod nalaza je korak koji roditelj mora sam da pređe:
 * mora da zamisli kako to izgleda kod njega. Ovde ne mora — vidi svoju
 * fotografiju sa zaštitom na mestu opasnosti, u veličini koju ta zaštita
 * zaista ima.
 *
 * Razmera se izvodi iz same opasnosti. Zna se koliko je široka utičnica ili
 * ivica stola u stvarnosti i koliko zauzima u kadru; odatle se zna koliko
 * piksela ide na centimetar, pa se rešenje nacrta u svojoj pravoj širini.
 *
 * Ono što je u sobi ispred opasnosti — noga stola, fotelja, dovratak —
 * ostaje ispred i rešenja. Dubina prostora se meri tek kad se ovaj prikaz
 * otvori, nikad tokom samog skeniranja: provera bezbednosti mora da ostane
 * trenutna. Kad merenje ne uspe, zaklanjanja nema, a sve ostalo radi.
 *
 * Izrezivanje pozadine, procena ravni i senka rade se u pregledaču, bez
 * servera — pa i van mreže, kao i ostatak aplikacije.
 */
export function InPlace({ photo, hazard, product }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState<Cutout | null>(null);
  const [plane, setPlane] = useState<Plane>(FLAT);
  const [boxW, setBoxW] = useState(0);
  const [on, setOn] = useState(true);
  /** Maska koja krije ono što je bliže od opasnosti; null = nema dubine. */
  const [mask, setMask] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!product.image_url) {
      setCut(null);
      return;
    }
    cutoutFrom(product.image_url).then((c) => alive && setCut(c));
    return () => {
      alive = false;
    };
  }, [product.image_url]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPlane(estimatePlane(img));
    img.src = photo;
    return () => {
      img.onload = null;
    };
  }, [photo]);

  // Dubina se meri jednom po fotografiji i tek ovde, kad roditelj otvori
  // prikaz. Skeniranje je time netaknuto.
  useEffect(() => {
    let alive = true;
    setMask(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      const map = await estimateDepth(img);
      if (!alive || !map) return;
      setMask(maskBehind(map, depthIn(map, hazard.box), SLACK));
    };
    img.src = photo;
    return () => {
      alive = false;
      img.onload = null;
    };
  }, [photo, hazard.box.x, hazard.box.y, hazard.box.w, hazard.box.h]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const read = () => setBoxW(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!cut?.ok) return null;

  // Opasnost je merilo: njena stvarna širina naspram njene širine u kadru
  // daje razmeru, a po njoj se rešenje crta u svojoj pravoj veličini.
  const hazardCm = CM_BY_CATEGORY[hazard.category] ?? 15;
  const solutionCm = realWidth(product.title, hazard.category);
  const width = Math.max(3, Math.min(90, hazard.box.w * 100 * (solutionCm / hazardCm)));

  // Predmet u izrezanoj slici retko stoji po sredini, pa se centrira po
  // svom okviru, a ne po okviru fajla.
  const aspect = (cut.box.h || 1) / (cut.box.w || 1);
  const cx = (hazard.box.x + hazard.box.w / 2) * 100;
  const cy = (hazard.box.y + hazard.box.h / 2) * 100;

  return (
    <div className="ip">
      <div className="ip-head">
        <b>{t("ip.title")}</b>
        <button className="ip-toggle" onClick={() => setOn((v) => !v)}>
          {on ? t("ip.hide") : t("ip.show")}
        </button>
      </div>

      <div className="ip-stage" ref={wrap} style={{ perspective: planePerspective(plane, boxW) }}>
        <img className="ip-photo" src={photo} alt="" />
        {on && (
          <div
            className="ip-behind"
            style={mask
              ? {
                  // Maska pokriva CEO kadar, pa stoji na omotaču a ne na
                  // samom predmetu — inače bi se pomerala zajedno s njim.
                  WebkitMaskImage: `url(${mask})`,
                  maskImage: `url(${mask})`,
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }
              : undefined}
          >
          <div
            className="ip-item"
            style={{
              width: `${width}%`,
              left: `${cx}%`,
              top: `${cy}%`,
              transform: pieceTransform(plane),
            }}
          >
            <img
              src={cut.url}
              alt={product.title}
              style={{
                aspectRatio: `1 / ${aspect}`,
                // Iseca se samo predmet iz slike — okolna praznina bi ga
                // odgurnula sa mesta na koje ga postavljamo.
                objectFit: "cover",
                objectPosition: `${cut.box.x * -100}% ${cut.box.y * -100}%`,
              }}
            />
          </div>
          </div>
        )}
      </div>

      <p className="ip-note">
        {product.title} · ~{solutionCm} cm · {t("ip.note")}
      </p>
    </div>
  );
}
