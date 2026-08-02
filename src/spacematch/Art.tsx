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
}

/**
 * Slika koja se pojavljuje tek kada zaista postoji.
 *
 * Stranica mora da izgleda gotovo i pre nego što fotografije stignu, a kad
 * stignu ne sme da poskoči. Zato se rezerva crta odmah, a fotografija se
 * prikazuje tek posle uspešnog učitavanja — bez polomljene ikonice i bez
 * pomeranja rasporeda.
 */
export function Art({ src, fallback, tint, className = "", alt = "", eager = false }: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`sm-art ${className}`.trim()} style={{ background: tint }}>
      {!loaded && <span className="sm-art-draw">{fallback}</span>}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={loaded ? "sm-art-on" : "sm-art-off"}
      />
    </div>
  );
}
