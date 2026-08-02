import { useEffect, useState } from "react";
import { getTenant, type Tenant } from "./api";
import { getLang, setLang } from "./i18n";
import { Landing } from "./Landing";
import { Owner } from "./Owner";
import { Scanner } from "./Scanner";
import { Studio } from "./Studio";

type View = "landing" | "scanner" | "studio" | "owner";

function initialView(): { view: View; slug: string } {
  const q = new URLSearchParams(location.search);
  const slug = q.get("t") ?? "";
  if (q.has("owner")) return { view: "owner", slug };
  if (q.has("studio")) return { view: "studio", slug };
  if (slug) return { view: "scanner", slug };
  return { view: "landing", slug };
}

export function App() {
  const start = initialView();
  const [view, setView] = useState<View>(start.view);
  const [slug, setSlug] = useState(start.slug);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [lang, setLangState] = useState(getLang());
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (view !== "scanner" || !slug) return;
    let live = true;
    getTenant(slug)
      .then((t) => {
        if (!live) return;
        setTenant(t);
        // Boje zakupca preuzimaju ceo ekran — kupac vidi njihov brend
        document.documentElement.style.setProperty("--sm-accent", t.accent || "#0f766e");
        document.documentElement.style.setProperty("--sm-ink", t.color || "#111827");
        document.title = `${t.name} · SpaceMatch`;
      })
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [view, slug]);

  if (view === "owner") return <Owner />;
  if (view === "studio") return <Studio />;

  if (view === "scanner") {
    if (missing) {
      return (
        <div className="sm-narrow" style={{ padding: "90px 20px", textAlign: "center" }}>
          <h1 className="sm-display" style={{ fontSize: "1.6rem" }}>
            This scanner is not available.
          </h1>
          <button className="sm-link" onClick={() => setView("landing")}>
            SpaceMatch AI →
          </button>
        </div>
      );
    }
    if (!tenant) return <div className="sm-narrow" style={{ padding: "90px 20px" }} />;
    // U iframe-u „X" zatvara widget kod domaćina; van njega vraća na odeljenje.
    const embedded = new URLSearchParams(location.search).has("embed");
    return (
      <Scanner
        tenant={tenant}
        onExit={() => {
          if (embedded) {
            parent.postMessage("spacematch:close", "*");
            return;
          }
          history.pushState({}, "", location.pathname);
          setTenant(null);
          setSlug("");
          setView("landing");
        }}
      />
    );
  }

  return (
    <Landing
      lang={lang}
      onLang={(l) => {
        setLang(l);
        setLangState(l);
      }}
      onDemo={() => {
        history.pushState({}, "", `?t=demo`);
        setSlug("demo");
        setView("scanner");
      }}
      onStudio={() => {
        history.pushState({}, "", `?studio=1`);
        setView("studio");
      }}
    />
  );
}
