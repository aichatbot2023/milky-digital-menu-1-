import { useEffect, useRef, useState } from "react";
import { LANGS, type Lang } from "./i18n";

interface Props {
  lang: Lang;
  onLang: (l: Lang) => void;
  /** Svetla varijanta — kada stoji na tamnoj traci skenera. */
  compact?: boolean;
}

/**
 * Izbor jezika: kratka oznaka koja otvara spisak. Kupac koji ne govori
 * engleski mora da vidi svoj jezik u prvom dodiru, ne u podešavanjima.
 */
export function LangPicker({ lang, onLang, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div className="sm-lang" ref={box}>
      <button
        className="sm-chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current.label}
      >
        {compact ? current.code.toUpperCase() : current.label}
      </button>
      {open && (
        <div className="sm-lang-menu" role="listbox">
          {LANGS.map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={l.code === lang}
              className={`sm-lang-item${l.code === lang ? " on" : ""}`}
              onClick={() => {
                onLang(l.code);
                setOpen(false);
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
