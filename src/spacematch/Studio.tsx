import { useEffect, useState } from "react";
import { call, type Tenant } from "./api";
import { t } from "./i18n";

const KEY_STORE = "spacematch.key";

type Tab = "brand" | "catalogue" | "leads" | "insight" | "embed";

/**
 * Kontrolna tabla zakupca: brend, kolekcija, upiti, uvidi i kod za ugradnju.
 * Sve ide preko ključa studija — nema lozinki koje bismo čuvali.
 */
export function Studio() {
  const [key, setKey] = useState(() => localStorage.getItem(KEY_STORE) ?? "");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tab, setTab] = useState<Tab>("brand");
  const [err, setErr] = useState("");

  const open = async (k: string) => {
    setErr("");
    try {
      const d = await call<{ tenant: Tenant }>({ action: "t-me", api_key: k });
      setTenant(d.tenant);
      localStorage.setItem(KEY_STORE, k);
    } catch {
      setErr(t("a.wrong"));
      setTenant(null);
    }
  };

  useEffect(() => {
    if (key) open(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!tenant) {
    return (
      <div className="sm-narrow" style={{ padding: "80px 20px" }}>
        <h1 className="sm-display" style={{ fontSize: "2rem", marginBottom: 20 }}>
          {t("a.title")}
        </h1>
        <label htmlFor="sk">{t("a.key")}</label>
        <input id="sk" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sm_…" />
        {err && <p className="sm-err" style={{ marginTop: 10 }}>{err}</p>}
        <button className="sm-btn sm-btn-accent sm-btn-block" style={{ marginTop: 16 }} onClick={() => open(key)}>
          {t("a.open")}
        </button>
      </div>
    );
  }

  return (
    <div className="sm-wrap" style={{ padding: "26px 22px 70px" }}>
      <header className="sm-brand" style={{ fontSize: "1.2rem" }}>
        {tenant.logo_url ? <img src={tenant.logo_url} alt="" /> : <span className="sm-brand-mark">{tenant.name.slice(0, 2).toUpperCase()}</span>}
        {tenant.name}
      </header>

      <div className="sm-tabs">
        {([
          ["brand", t("a.brand")],
          ["catalogue", t("a.catalogue")],
          ["leads", t("a.leads")],
          ["insight", t("a.insight")],
          ["embed", t("a.embed")],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={`sm-chip${tab === id ? " sm-chip-on" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "brand" && <Brand apiKey={key} tenant={tenant} onSaved={setTenant} />}
      {tab === "catalogue" && <Catalogue apiKey={key} slug={tenant.slug} />}
      {tab === "leads" && <Leads apiKey={key} />}
      {tab === "insight" && <Insight apiKey={key} />}
      {tab === "embed" && <Embed slug={tenant.slug} />}
    </div>
  );
}

function Brand({ apiKey, tenant, onSaved }: { apiKey: string; tenant: Tenant; onSaved: (t: Tenant) => void }) {
  const [f, setF] = useState<Record<string, string>>({
    name: tenant.name,
    logo_url: tenant.logo_url ?? "",
    accent: tenant.accent,
    color: tenant.color,
    headline: tenant.headline ?? "",
    subline: tenant.subline ?? "",
    prompt_extra: tenant.prompt_extra ?? "",
    contact_email: tenant.contact_email ?? "",
    contact_phone: tenant.contact_phone ?? "",
    website: tenant.website ?? "",
    domain: tenant.domain ?? "",
    vertical: tenant.vertical,
    currency: tenant.currency,
  });
  const [saved, setSaved] = useState(false);
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));

  const save = async () => {
    await call({ action: "t-update", api_key: apiKey, fields: f });
    const d = await call<{ tenant: Tenant }>({ action: "t-me", api_key: apiKey });
    onSaved(d.tenant);
    document.documentElement.style.setProperty("--sm-accent", f.accent);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const field = (k: string, label: string, type = "text") => (
    <div key={k}>
      <label htmlFor={`f-${k}`}>{label}</label>
      <input id={`f-${k}`} type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="sm-panel">
      <div className="sm-grid2">
        {field("name", "Studio name")}
        {field("logo_url", "Logo URL")}
        {field("accent", "Accent colour", "color")}
        {field("color", "Text colour", "color")}
        <div>
          <label htmlFor="f-vertical">Sector</label>
          <select id="f-vertical" value={f.vertical} onChange={(e) => set("vertical", e.target.value)}>
            {["art", "furniture", "lighting", "interior", "kitchen", "flooring", "realestate"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-currency">Currency</label>
          <select id="f-currency" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            {["GBP", "EUR", "USD", "RSD"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {field("headline", "Scanner headline")}
        {field("subline", "Scanner subtitle")}
        {field("contact_email", "Contact email", "email")}
        {field("contact_phone", "Contact phone")}
        {field("website", "Website")}
        {field("domain", "Custom domain")}
      </div>
      <div>
        <label htmlFor="f-prompt">Studio brief — what the AI should pay attention to</label>
        <textarea
          id="f-prompt"
          rows={3}
          value={f.prompt_extra}
          onChange={(e) => set("prompt_extra", e.target.value)}
          placeholder="e.g. We sell large-format canvases; always judge whether a piece over 120 cm would fit."
        />
      </div>
      <button className="sm-btn sm-btn-accent" onClick={save}>
        {saved ? t("a.saved") : t("a.save")}
      </button>
    </div>
  );
}

const EMPTY = {
  title: "",
  price: "",
  image_url: "",
  url: "",
  style: "",
  colors: "",
  materials: "",
  room_types: "",
  width_cm: "",
  height_cm: "",
  tags: "",
  description: "",
};

function Catalogue({ apiKey, slug }: { apiKey: string; slug: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [p, setP] = useState({ ...EMPTY });
  const [msg, setMsg] = useState("");

  const load = () => call<{ products: any[] }>({ action: "products", slug }).then((d) => setRows(d.products));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!p.title.trim()) return;
    try {
      await call({ action: "t-product-add", api_key: apiKey, product: p });
      setP({ ...EMPTY });
      load();
    } catch (e: any) {
      setMsg(e?.message === "plan_product_limit" ? "Plan limit reached." : "Could not add.");
    }
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(",").map((c) => c.trim());
    const parsed = lines.map((l) => {
      // Prosti CSV: vrednost sa zarezom se navodi pod navodnicima
      const vals = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((v) => v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
      const o: Record<string, string> = {};
      cols.forEach((c, i) => (o[c] = (vals[i] ?? "").trim()));
      return o;
    });
    const d = await call<{ added: number; skipped: number }>({ action: "t-import", api_key: apiKey, rows: parsed });
    setMsg(`${d.added} added, ${d.skipped} skipped`);
    load();
  };

  const field = (k: keyof typeof EMPTY, label: string) => (
    <div key={k}>
      <label htmlFor={`p-${k}`}>{label}</label>
      <input id={`p-${k}`} value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} />
    </div>
  );

  return (
    <>
      <div className="sm-panel">
        <b>{t("a.add")}</b>
        <div className="sm-grid2">
          {field("title", "Title")}
          {field("price", "Price")}
          {field("image_url", "Image URL")}
          {field("url", "Product page URL")}
          {field("style", "Styles (comma separated)")}
          {field("colors", "Colours (hex, comma separated)")}
          {field("materials", "Materials")}
          {field("room_types", "Room types")}
          {field("width_cm", "Width cm")}
          {field("height_cm", "Height cm")}
          {field("tags", "Tags")}
          {field("description", "Description")}
        </div>
        {msg && <p className="sm-ok">{msg}</p>}
        <div className="sm-secondary-row">
          <button className="sm-btn sm-btn-accent" onClick={add}>
            {t("a.add")}
          </button>
          <label className="sm-btn sm-btn-quiet" style={{ margin: 0 }}>
            {t("a.import")}
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
          </label>
        </div>
        <p className="sm-muted" style={{ fontSize: "0.78rem" }}>
          CSV columns: title,price,image_url,url,style,colors,materials,room_types,width_cm,height_cm,tags,description
        </p>
      </div>

      <div className="sm-panel" style={{ marginTop: 14 }}>
        <b>
          {t("a.catalogue")} · {rows.length}
        </b>
        <div style={{ overflowX: "auto" }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th />
                <th>Title</th>
                <th>Style</th>
                <th>Size</th>
                <th>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.image_url && <img className="sm-rowimg" src={r.image_url} alt="" loading="lazy" />}</td>
                  <td>{r.title}</td>
                  <td>{r.style}</td>
                  <td>
                    {r.width_cm && r.height_cm ? `${Math.round(Number(r.width_cm))}×${Math.round(Number(r.height_cm))}` : "—"}
                  </td>
                  <td>{r.price ?? "—"}</td>
                  <td>
                    <button
                      className="sm-link"
                      onClick={async () => {
                        await call({ action: "t-product-del", api_key: apiKey, id: r.id });
                        load();
                      }}
                    >
                      {t("a.del")}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="sm-muted">
                    {t("a.none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Leads({ apiKey }: { apiKey: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    call<{ leads: any[] }>({ action: "t-leads", api_key: apiKey }).then((d) => setRows(d.leads));
  }, [apiKey]);
  return (
    <div className="sm-panel">
      <div style={{ overflowX: "auto" }}>
        <table className="sm-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{String(r.created_at).slice(0, 16).replace("T", " ")}</td>
                <td>{r.name}</td>
                <td>
                  <a href={`mailto:${r.email}`}>{r.email}</a>
                </td>
                <td>{r.phone}</td>
                <td>{r.message}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="sm-muted">
                  {t("a.none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Insight({ apiKey }: { apiKey: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    call({ action: "t-stats", api_key: apiKey }).then(setD);
  }, [apiKey]);
  if (!d) return <div className="sm-panel sm-muted">…</div>;
  const max = (rows: any[]) => Math.max(1, ...rows.map((r) => r.n));
  return (
    <>
      <div className="sm-kpis">
        <div className="sm-kpi">
          <b>{d.totals.scans}</b>
          <span>{t("a.scans")}</span>
        </div>
        <div className="sm-kpi">
          <b>{d.totals.leads}</b>
          <span>{t("a.leads")}</span>
        </div>
        <div className="sm-kpi">
          <b>{d.totals.products}</b>
          <span>{t("a.products")}</span>
        </div>
        <div className="sm-kpi">
          <b>{d.totals.clicks}</b>
          <span>{t("a.clicks")}</span>
        </div>
      </div>
      <div className="sm-panel" style={{ marginTop: 14 }}>
        <b>{t("a.rooms")}</b>
        {d.rooms.length === 0 && <span className="sm-muted">{t("a.none")}</span>}
        {d.rooms.map((r: any) => (
          <div key={r.room} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 120, fontSize: "0.86rem" }}>{r.room}</span>
            <div className="sm-bar" style={{ width: `${(r.n / max(d.rooms)) * 100}%` }} />
            <b style={{ fontSize: "0.82rem" }}>{r.n}</b>
          </div>
        ))}
      </div>
      <div className="sm-panel" style={{ marginTop: 14 }}>
        <b>{t("a.styles")}</b>
        {d.styles.length === 0 && <span className="sm-muted">{t("a.none")}</span>}
        {d.styles.map((r: any) => (
          <div key={r.style} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 120, fontSize: "0.86rem" }}>{r.style}</span>
            <div className="sm-bar" style={{ width: `${(r.n / max(d.styles)) * 100}%` }} />
            <b style={{ fontSize: "0.82rem" }}>{r.n}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function Embed({ slug }: { slug: string }) {
  const origin = location.origin;
  const snippet = `<script src="${origin}/spacematch.js" data-studio="${slug}" defer><\/script>`;
  const direct = `${origin}/spacematch/?t=${slug}`;
  return (
    <div className="sm-panel">
      <b>{t("d.embed")}</b>
      <div className="sm-code">{snippet}</div>
      <button
        className="sm-btn sm-btn-quiet"
        onClick={() => navigator.clipboard?.writeText(snippet)}
      >
        Copy
      </button>
      <p className="sm-muted" style={{ fontSize: "0.86rem" }}>
        {t("d.embedNote")}
      </p>
      <b style={{ marginTop: 10 }}>Direct link</b>
      <div className="sm-code">{direct}</div>
      <a className="sm-link" href={direct} target="_blank" rel="noopener">
        {t("d.try")} →
      </a>
    </div>
  );
}
