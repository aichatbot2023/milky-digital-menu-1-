import { useEffect, useMemo, useState } from "react";
import { buildDemo, call } from "./api";
import { LANGS } from "./i18n";

/** Levak: svaka firma ide ovim redom, i uvek se vidi gde je zapela. */
const STATUSES = [
  ["new", "New"],
  ["demo_ready", "Demo ready"],
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["meeting", "Meeting"],
  ["won", "Won"],
  ["lost", "Lost"],
] as const;

const VERTICALS = ["art", "furniture", "lighting", "interior", "kitchen", "flooring", "realestate"];

interface Prospect {
  id: string;
  company: string;
  website: string | null;
  country: string | null;
  city: string | null;
  vertical: string | null;
  lang: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  demo_slug: string | null;
  demo_url: string | null;
  studio_key: string | null;
  products_found: number | null;
  demo_error: string | null;
  outreach_subject: string | null;
  outreach_body: string | null;
  outreach_short: string | null;
  notes: string | null;
  next_action_at: string | null;
  updated_at: string;
}

const EMPTY = {
  company: "", website: "", country: "", city: "", vertical: "art",
  lang: "en", contact_name: "", email: "", phone: "", notes: "",
};

/**
 * Prodajni sto: uvezi listu firmi → jedan klik napravi demo od njihovog
 * sajta → jedan klik složi ponudu na njihovom jeziku → pošalji i prati.
 */
export function Crm({ adminKey }: { adminKey: string }) {
  const [rows, setRows] = useState<Prospect[]>([]);
  const [counts, setCounts] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [open, setOpen] = useState<Prospect | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const d = await call<{ prospects: Prospect[]; counts: any }>({
      action: "prospects",
      admin_key: adminKey,
      status: filter || undefined,
    });
    setRows(d.prospects);
    setCounts(d.counts);
    if (open) setOpen(d.prospects.find((p) => p.id === open.id) ?? null);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.company, r.website, r.country, r.city, r.email, r.contact_name]
        .some((v) => (v ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const patch = async (id: string, fields: Record<string, unknown>) => {
    await call({ action: "prospect-update", admin_key: adminKey, id, fields });
    load();
  };

  /** Napravi demo od sajta firme — ovo je jedini korak koji traje. */
  const makeDemo = async (p: Prospect) => {
    if (!p.website) {
      setMsg("Add the website first.");
      return;
    }
    setBusy(p.id);
    setMsg("");
    try {
      const d = await buildDemo(adminKey, p.website, p.vertical ?? undefined);
      await patch(p.id, {
        demo_slug: d.slug,
        demo_url: d.demo_url,
        studio_key: d.api_key,
        products_found: d.products,
        status: "demo_ready",
        demo_error: null,
      });
      setMsg(`${d.brand?.name ?? p.company}: ${d.products} products via ${d.source}`);
    } catch (e: any) {
      const why =
        e?.message === "no_products" ? "The site does not expose products — import a CSV instead."
        : e?.message === "site_unreachable" ? "The site did not respond."
        : e?.message === "bad_url" ? "Check the website address."
        : String(e?.message ?? "failed");
      await patch(p.id, { demo_error: why });
      setMsg(why);
    } finally {
      setBusy(null);
    }
  };

  const writeOffer = async (p: Prospect, ai = false) => {
    setBusy(p.id);
    try {
      await call({ action: "outreach", admin_key: adminKey, id: p.id, ai });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const cols = head.split(",").map((c) => c.trim().toLowerCase());
    const parsed = lines.map((l) => {
      const vals =
        l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((v) =>
          v.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim(),
        ) ?? [];
      const o: Record<string, string> = {};
      cols.forEach((c, i) => (o[c] = vals[i] ?? ""));
      return o;
    });
    const d = await call<{ added: number; skipped: number }>({
      action: "prospect-import",
      admin_key: adminKey,
      rows: parsed,
    });
    setMsg(`${d.added} added, ${d.skipped} already known`);
    load();
  };

  const exportCsv = () => {
    const cols = ["company", "website", "country", "city", "vertical", "lang", "contact_name", "email", "phone", "status", "demo_url", "products_found", "next_action_at"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "spacematch-prospects.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const mailto = (p: Prospect) =>
    `mailto:${p.email ?? ""}?subject=${encodeURIComponent(p.outreach_subject ?? "")}&body=${encodeURIComponent(p.outreach_body ?? "")}`;

  const field = (k: keyof typeof EMPTY, label: string) => (
    <div key={k}>
      <label htmlFor={`c-${k}`}>{label}</label>
      <input id={`c-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <>
      {counts && (
        <div className="sm-kpis">
          <div className="sm-kpi"><b>{counts.total}</b><span>Prospects</span></div>
          <div className="sm-kpi"><b>{counts.with_demo}</b><span>Demos built</span></div>
          <div className="sm-kpi"><b>{counts.contacted}</b><span>Contacted</span></div>
          <div className="sm-kpi"><b>{counts.replied}</b><span>Replied</span></div>
          <div className="sm-kpi"><b>{counts.won}</b><span>Won</span></div>
          <div className="sm-kpi"><b>{counts.due}</b><span>Follow up today</span></div>
        </div>
      )}

      <div className="sm-panel" style={{ marginTop: 14 }}>
        <b>Add a company</b>
        <div className="sm-grid2">
          {field("company", "Company")}
          {field("website", "Website")}
          {field("country", "Country")}
          {field("city", "City")}
          {field("contact_name", "Contact person")}
          {field("email", "Email")}
          {field("phone", "Phone")}
          <div>
            <label htmlFor="c-vert">Sector</label>
            <select id="c-vert" value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })}>
              {VERTICALS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="c-lang">Their language</label>
            <select id="c-lang" value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>
        <div className="sm-secondary-row">
          <button
            className="sm-btn sm-btn-accent"
            onClick={async () => {
              if (!form.company.trim()) return;
              await call({ action: "prospect-add", admin_key: adminKey, prospect: form });
              setForm({ ...EMPTY });
              load();
            }}
          >
            Add
          </button>
          <label className="sm-btn sm-btn-quiet" style={{ margin: 0 }}>
            Import CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </label>
          <button className="sm-btn sm-btn-quiet" onClick={exportCsv}>Export</button>
        </div>
        <p className="sm-muted" style={{ fontSize: "0.78rem" }}>
          CSV columns: company,website,country,city,vertical,lang,contact_name,email,phone,notes
        </p>
        {msg && <p className="sm-ok">{msg}</p>}
      </div>

      <div className="sm-tabs" style={{ marginTop: 16 }}>
        <button className={`sm-chip${filter === "" ? " sm-chip-on" : ""}`} onClick={() => setFilter("")}>All</button>
        {STATUSES.map(([id, label]) => (
          <button key={id} className={`sm-chip${filter === id ? " sm-chip-on" : ""}`} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          style={{ width: 180, padding: "8px 14px", borderRadius: 999 }}
        />
      </div>

      <div className="sm-panel">
        <div style={{ overflowX: "auto" }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Where</th>
                <th>Contact</th>
                <th>Demo</th>
                <th>Status</th>
                <th>Follow up</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.company}</b>
                    {p.website && (
                      <>
                        <br />
                        <a className="sm-link" href={p.website} target="_blank" rel="noopener">
                          {p.website.replace(/^https?:\/\//, "").slice(0, 34)}
                        </a>
                      </>
                    )}
                  </td>
                  <td>
                    {[p.city, p.country].filter(Boolean).join(", ")}
                    <br />
                    <span className="sm-muted" style={{ fontSize: "0.76rem" }}>
                      {p.vertical} · {p.lang.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {p.contact_name}
                    {p.email && (
                      <>
                        <br />
                        <a className="sm-link" href={`mailto:${p.email}`}>{p.email}</a>
                      </>
                    )}
                  </td>
                  <td>
                    {p.demo_url ? (
                      <>
                        <a className="sm-link" href={p.demo_url} target="_blank" rel="noopener">Open</a>
                        <br />
                        <span className="sm-muted" style={{ fontSize: "0.76rem" }}>{p.products_found} items</span>
                      </>
                    ) : busy === p.id ? (
                      <span className="sm-muted">building…</span>
                    ) : (
                      <>
                        <button className="sm-link" onClick={() => makeDemo(p)}>Build</button>
                        {p.demo_error && (
                          <div className="sm-err" style={{ fontSize: "0.72rem" }}>{p.demo_error}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      value={p.status}
                      onChange={(e) => patch(p.id, { status: e.target.value })}
                      style={{ padding: "6px 8px", fontSize: "0.82rem" }}
                    >
                      {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={p.next_action_at ? String(p.next_action_at).slice(0, 10) : ""}
                      onChange={(e) => patch(p.id, { next_action_at: e.target.value })}
                      style={{ padding: "6px 8px", fontSize: "0.82rem" }}
                    />
                  </td>
                  <td>
                    <button className="sm-link" onClick={() => setOpen(p)}>Offer</button>
                    <br />
                    <button
                      className="sm-link"
                      onClick={async () => {
                        if (!confirm(`Remove ${p.company}?`)) return;
                        await call({ action: "prospect-del", admin_key: adminKey, id: p.id });
                        load();
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="sm-muted">No companies yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="sm-sheet" onClick={() => setOpen(null)}>
          <div className="sm-sheet-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="sm-display">{open.company}</h3>
            <p className="sm-muted" style={{ fontSize: "0.86rem" }}>
              Offer in {LANGS.find((l) => l.code === open.lang)?.label ?? open.lang}
              {open.demo_url ? " · demo link included" : " · no demo yet, the generic link will be used"}
            </p>

            {!open.outreach_body ? (
              <div className="sm-secondary-row">
                <button className="sm-btn sm-btn-accent" disabled={busy === open.id} onClick={() => writeOffer(open)}>
                  Prepare offer
                </button>
                <button className="sm-btn sm-btn-quiet" disabled={busy === open.id} onClick={() => writeOffer(open, true)}>
                  Personalise
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="o-sub">Subject</label>
                  <input id="o-sub" readOnly value={open.outreach_subject ?? ""} />
                </div>
                <div>
                  <label htmlFor="o-body">Email</label>
                  <textarea id="o-body" rows={12} readOnly value={open.outreach_body} />
                </div>
                <div>
                  <label htmlFor="o-short">LinkedIn / WhatsApp</label>
                  <textarea id="o-short" rows={3} readOnly value={open.outreach_short ?? ""} />
                </div>
                <div className="sm-secondary-row">
                  <a
                    className="sm-btn sm-btn-accent"
                    href={mailto(open)}
                    onClick={() => patch(open.id, { status: "contacted" })}
                  >
                    Open in email
                  </a>
                  <button
                    className="sm-btn sm-btn-quiet"
                    onClick={() => navigator.clipboard?.writeText(`${open.outreach_subject}\n\n${open.outreach_body}`)}
                  >
                    Copy
                  </button>
                  <button className="sm-btn sm-btn-quiet" disabled={busy === open.id} onClick={() => writeOffer(open, true)}>
                    Personalise
                  </button>
                </div>
              </>
            )}

            <div>
              <label htmlFor="o-notes">Notes</label>
              <textarea
                id="o-notes"
                rows={3}
                defaultValue={open.notes ?? ""}
                onBlur={(e) => patch(open.id, { notes: e.target.value })}
              />
            </div>
            {open.studio_key && (
              <p className="sm-muted" style={{ fontSize: "0.76rem" }}>
                Studio key when they sign: <code>{open.studio_key}</code>
              </p>
            )}
            <button className="sm-btn sm-btn-block" onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
