import { useState } from "react";

interface Props {
  /** Putanja fotografije; dok je nema, ostaje nacrtana sličica. */
  src: string;
  /** Rezervni prikaz — linijska sličica na obojenoj podlozi. */
  fallback: JSX.Element;
  tint: string;
  className?: string;
  alt?: string;
  /** Ispod prvog ekrana se učitava lenjo. */
  eager?: boolean;
  /** Prave dimenzije fajla — bez njih raspored poskoči kad slika stigne. */
  w?: number;
  h?: number;
  /** Koliko mesta slika zauzima, da pregledač uzme pravu veličinu. */
  sizes?: string;
}

/**
 * Slika koja se pojavljuje tek kada zaista postoji.
 *
 * Stranica mora da izgleda gotovo i pre nego što fotografije stignu, a kad
 * stignu ne sme da poskoči. Zato se rezerva crta odmah, a fotografija se
 * prikazuje tek posle uspešnog učitavanja — bez polomljene ikonice i bez
 * pomeranja rasporeda.
 */
export function Art({
  src, fallback, tint, className = "", alt = "", eager = false, w, h, sizes,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  // Uz svaki .jpg stoji i lakši .webp plus upola uža verzija za telefone.
  const base = src.replace(/\.jpe?g$/i, "");
  const srcSet = w
    ? `${base}@0.5x.webp ${Math.round(w / 2)}w, ${base}.webp ${w}w`
    : `${base}.webp`;
  return (
    <div className={`sm-art ${className}`.trim()} style={{ background: tint }}>
      {!loaded && <span className="sm-art-draw">{fallback}</span>}
      <picture>
        <source type="image/webp" srcSet={srcSet} sizes={sizes} />
        <img
          src={src}
          alt={alt}
          width={w}
          height={h}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={loaded ? "sm-art-on" : "sm-art-off"}
        />
      </picture>
    </div>
  );
}
