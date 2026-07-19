import { useState } from "react";
import { LANGS, setLang } from "../lib/i18n";

interface Props {
  onDone: () => void;
}

// Prvi ekran aplikacije: izbor jezika. Od tog trenutka SVE u aplikaciji
// (AI analize, upozorenja, edukacija, glas) radi na izabranom jeziku.
export function LanguagePicker({ onDone }: Props) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = LANGS.filter(
    (l) =>
      l.native.toLowerCase().includes(query.toLowerCase()) ||
      l.english.toLowerCase().includes(query.toLowerCase()),
  );

  const confirm = (code: string) => {
    setLang(code);
    onDone();
  };

  return (
    <div className="app langpick">
      <header className="hero">
        <h1>🛡️ SafeNest AI</h1>
        <p>
          Choose your language · Izaberite jezik · Elige tu idioma · اختر لغتك ·
          अपनी भाषा चुनें · 选择语言
        </p>
      </header>

      <input
        className="lang-search"
        placeholder="Search languages… / Pretraži jezike…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="lang-grid">
        {filtered.map((l) => (
          <button
            key={l.code}
            className={`lang-item${selected === l.code ? " lang-item-active" : ""}`}
            onClick={() => {
              setSelected(l.code);
              confirm(l.code);
            }}
          >
            <strong>{l.native}</strong>
            <span>{l.english}</span>
          </button>
        ))}
      </div>

      <p className="muted lang-note">
        AI detections, warnings and education will follow your language. You can
        change it anytime from the home screen.
      </p>
    </div>
  );
}
