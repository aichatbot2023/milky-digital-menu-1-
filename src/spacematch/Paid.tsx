import { useEffect, useState } from "react";
import { billing } from "./api";
import { t } from "./i18n";

/**
 * Ekran posle plaćanja. Studio otvara webhook, ne ovaj ekran — zato se
 * ovde ništa ne pravi, samo se pokazuje šta dalje. Ako Stripe odgovori na
 * vreme, odmah se vidi i ključ; ako ne, ključ svakako stiže mejlom.
 */
export function Paid({ onStudio }: { onStudio: () => void }) {
  const [studio, setStudio] = useState<{ slug: string; name: string; api_key: string } | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("session");
    if (!id) return;
    let live = true;
    // Webhook i povratak korisnika stižu skoro istovremeno; par pokušaja
    // je dovoljno da se ključ pokaže bez čekanja na mejl.
    let tries = 0;
    const tick = async () => {
      if (!live || tries++ > 5) return;
      try {
        const d = await billing<{ studio: typeof studio }>({ action: "session", session: id });
        if (live && d.studio) {
          setStudio(d.studio);
          return;
        }
      } catch {
        /* ključ nema pravo čitanja sesije — mejl ionako stiže */
      }
      setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="sm-narrow" style={{ padding: "90px 20px", textAlign: "center" }}>
      <div
        style={{
          width: 64, height: 64, margin: "0 auto 22px", borderRadius: "50%",
          background: "var(--sm-accent)", display: "grid", placeItems: "center",
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      </div>
      <h1 className="sm-display" style={{ fontSize: "1.7rem" }}>{t("paid.title")}</h1>
      <p className="sm-note" style={{ marginTop: 14 }}>{t("paid.sub")}</p>

      {studio && (
        <div className="sm-panel" style={{ marginTop: 24, textAlign: "start" }}>
          <b>{studio.name}</b>
          <div>
            <label htmlFor="pk">{t("a.key")}</label>
            <input id="pk" readOnly value={studio.api_key} onFocus={(e) => e.currentTarget.select()} />
          </div>
          <a className="sm-link" href={`?t=${studio.slug}`}>
            {location.origin}/spacematch/?t={studio.slug}
          </a>
        </div>
      )}

      <button className="sm-btn sm-btn-accent sm-btn-block" style={{ marginTop: 24 }} onClick={onStudio}>
        {t("paid.open")}
      </button>
    </div>
  );
}
