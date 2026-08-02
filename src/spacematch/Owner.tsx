import { useEffect, useState } from "react";
import { call } from "./api";

const KEY_STORE = "spacematch.owner";

/**
 * Konzola vlasnika platforme: otvaranje novih studija, njihovi ključevi i
 * ukupan promet sistema. Ključ se nikada ne šalje nigde osim našoj funkciji.
 */
export function Owner() {
  const [key, setKey] = useState(() => sessionStorage.getItem(KEY_STORE) ?? "");
  const [rows, setRows] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", slug: "", vertical: "art", plan: "starter", contact_email: "" });
  const [created, setCreated] = useState<{ slug: string; api_key: string } | null>(null);

  const load = async (k: string) => {
    setErr("");
    try {
      const d = await call<{ tenants: any[] }>({ action: "list", admin_key: k });
      setRows(d.tenants);
      setStats(await call({ action: "platform-stats", admin_key: k }));
      sessionStorage.setItem(KEY_STORE, k);
    } catch {
      setErr("Wrong key.");
      setRows(null);
    }
  };

  useEffect(() => {
    if (key) load(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows) {
    return (
      <div className="sm-narrow" style={{ padding: "80px 20px" }}>
        <h1 className="sm-display" style={{ fontSize: "2rem", marginBottom: 20 }}>
          SpaceMatch · platform
        </h1>
        <label htmlFor="ok">Admin key</label>
        <input id="ok" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        {err && <p className="sm-err" style={{ marginTop: 10 }}>{err}</p>}
        <button className="sm-btn sm-btn-accent sm-btn-block" style={{ marginTop: 16 }} onClick={() => load(key)}>
          Open
        </button>
      </div>
    );
  }

  return (
    <div className="sm-wrap" style={{ padding: "26px 22px 70px" }}>
      <h1 className="sm-display" style={{ fontSize: "1.8rem", marginBottom: 18 }}>
        SpaceMatch · platform
      </h1>

      {stats && (
        <div className="sm-kpis">
          <div className="sm-kpi">
            <b>{stats.totals.tenants}</b>
            <span>Studios</span>
          </div>
          <div className="sm-kpi">
            <b>{stats.totals.products}</b>
            <span>Pieces</span>
          </div>
          <div className="sm-kpi">
            <b>{stats.totals.scans}</b>
            <span>Scans</span>
          </div>
          <div className="sm-kpi">
            <b>{stats.totals.leads}</b>
            <span>Enquiries</span>
          </div>
        </div>
      )}

      <div className="sm-panel" style={{ marginTop: 14 }}>
        <b>New studio</b>
        <div className="sm-grid2">
          <div>
            <label htmlFor="n-name">Name</label>
            <input id="n-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="n-slug">Link (slug)</label>
            <input id="n-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
          <div>
            <label htmlFor="n-vert">Sector</label>
            <select id="n-vert" value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })}>
              {["art", "furniture", "lighting", "interior", "kitchen", "flooring", "realestate"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="n-plan">Plan</label>
            <select id="n-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              {["starter", "professional", "business", "enterprise"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="n-mail">Contact email</label>
            <input id="n-mail" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
        </div>
        <button
          className="sm-btn sm-btn-accent"
          onClick={async () => {
            try {
              const d = await call<{ slug: string; api_key: string }>({ action: "create", admin_key: key, ...form });
              setCreated(d);
              setForm({ name: "", slug: "", vertical: "art", plan: "starter", contact_email: "" });
              load(key);
            } catch (e: any) {
              setErr(e?.message === "slug_taken" ? "That link is taken." : "Could not create.");
            }
          }}
        >
          Create
        </button>
        {created && (
          <p className="sm-ok">
            {created.slug} → <code>{created.api_key}</code> (studio key — send it to the client)
          </p>
        )}
        {err && <p className="sm-err">{err}</p>}
      </div>

      <div className="sm-panel" style={{ marginTop: 14 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="sm-table">
            <thead>
              <tr>
                <th>Studio</th>
                <th>Sector</th>
                <th>Plan</th>
                <th>Pieces</th>
                <th>Scans</th>
                <th>Leads</th>
                <th>Key</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a className="sm-link" href={`?t=${r.slug}`} target="_blank" rel="noopener">
                      {r.name}
                    </a>
                  </td>
                  <td>{r.vertical}</td>
                  <td>{r.plan}</td>
                  <td>{r.products}</td>
                  <td>{r.scans}</td>
                  <td>{r.leads}</td>
                  <td>
                    <code style={{ fontSize: "0.72rem" }}>{r.api_key}</code>
                  </td>
                  <td>
                    <button
                      className="sm-link"
                      onClick={async () => {
                        if (!confirm(`Delete ${r.name} and all its data?`)) return;
                        await call({ action: "delete", admin_key: key, slug: r.slug });
                        load(key);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
