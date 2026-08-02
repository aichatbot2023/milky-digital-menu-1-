import { useEffect, useState } from "react";

interface Props {
  /** Menja se pri svakoj potvrdi — pokreće novu eksploziju. */
  trigger: number;
  color?: string;
  count?: number;
}

/**
 * Mikro-eksplozija čestica na potvrdu („Rešeno"). Prsten se širi, čestice
 * se razlete u krug, sve u akcentnoj boji. Animira se isključivo transform
 * i opacity, pa ne izaziva reflow; posle 700 ms se sama ukloni iz DOM-a.
 */
export function Burst({ trigger, color = "#10b981", count = 10 }: Props) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (trigger === 0) return;
    setOn(true);
    const id = setTimeout(() => setOn(false), 720);
    return () => clearTimeout(id);
  }, [trigger]);

  if (!on) return null;
  return (
    <span className="burst" style={{ ["--burst-color" as string]: color }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            ["--a" as string]: `${(360 / count) * i}deg`,
            animationDelay: `${i * 8}ms`,
          }}
        />
      ))}
    </span>
  );
}
