import { useEffect, useRef, useState } from "react";
import {
  analyzeSpace,
  downscale,
  recommend,
  sendInquiry,
  track,
  type Alternative,
  type Match,
  type RoomProfile,
  type Tenant,
} from "./api";
import { aiLanguage, getLang, setLang, t, type Lang } from "./i18n";
import { LangPicker } from "./LangPicker";
import { LiveScan } from "./LiveScan";
import { WallPreview } from "./WallPreview";

interface Props {
  tenant: Tenant;
  onExit?: () => void;
}

type Stage = "start" | "live" | "reading" | "profile" | "match" | "error";

/**
 * Ceo tok kupca na jednom mestu: slikaj → razumemo prostor → JEDNA
 * preporuka → pregled na zidu → upit. Ni na jednom ekranu ne postoji više
 * od jedne glavne akcije, i nijedna reč ne pominje model ni AI.
 */
export function Scanner({ tenant, onExit }: Props) {
  const [stage, setStage] = useState<Stage>("start");
  const [shot, setShot] = useState<string | null>(null);
  const [profile, setProfile] = useState<RoomProfile | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [alts, setAlts] = useState<Alternative[]>([]);
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState("");
  const [lang, setLangState] = useState<Lang>(getLang());
  // Uživo režim traži kameru — na desktopu bez nje nudimo samo fotografiju
  const liveCapable =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  // Promena jezika usred pregleda: rečenice preporuke se traže ponovo,
  // da kupac ne ostane sa pola teksta na starom jeziku.
  const switchLang = async (l: Lang) => {
    setLang(l);
    setLangState(l);
    if (!profile) return;
    try {
      const r = await recommend(tenant.slug, profile, {}, l);
      setMatches(r.recommendations);
      setAlts(r.alternatives);
      setIdx((i) => Math.min(i, Math.max(0, r.recommendations.length - 1)));
    } catch {
      /* zadrži postojeće preporuke */
    }
  };

  useEffect(() => {
    track(tenant.slug, "open");
  }, [tenant.slug]);

  // Koraci „čitanja" teku ravnomerno dok pravi odgovor ne stigne — čekanje
  // sa objašnjenjem deluje kraće od čekanja sa točkićem.
  useEffect(() => {
    if (stage !== "reading") return;
    const id = setInterval(() => setStep((s) => Math.min(3, s + 1)), 1100);
    return () => clearInterval(id);
  }, [stage]);

  const run = async (file: File) => {
    setErr("");
    setStep(0);
    try {
      const image = await downscale(file);
      setShot(image);
      setStage("reading");
      const p = await analyzeSpace(tenant.slug, image, aiLanguage());
      setProfile(p);
      setStage("profile");
      const r = await recommend(tenant.slug, p, {}, getLang());
      setMatches(r.recommendations);
      setAlts(r.alternatives);
      setIdx(0);
    } catch (e: any) {
      setErr(e?.message === "plan_scan_limit" ? "This studio has reached its monthly limit." : t("s.failed"));
      setStage("error");
    }
  };

  const current = matches[idx];

  const reset = () => {
    setStage("start");
    setShot(null);
    setProfile(null);
    setMatches([]);
    setAlts([]);
    setIdx(0);
    setPreview(false);
    setBrowse(false);
  };

  return (
    <div className="sm-scan">
      <header className="sm-top">
        <div className="sm-brand">
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt="" />
          ) : (
            <span className="sm-brand-mark">{tenant.name.slice(0, 2).toUpperCase()}</span>
          )}
          {tenant.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <LangPicker lang={lang} onLang={switchLang} compact />
          {onExit && (
            <button className="sm-link" onClick={onExit} aria-label={t("st.close")}>
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="sm-scan-body sm-narrow">
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => e.target.files?.[0] && run(e.target.files[0])}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && run(e.target.files[0])}
        />

        {stage === "start" && (
          <div className="sm-drop sm-rise">
            <h2 className="sm-display">{tenant.headline || t("s.start")}</h2>
            <p>{tenant.subline || t("s.hint")}</p>
            <div className="sm-drop-actions">
              {liveCapable && (
                <button className="sm-btn sm-btn-accent sm-btn-lg" onClick={() => setStage("live")}>
                  {t("lv.start")}
                </button>
              )}
              <button
                className={`sm-btn ${liveCapable ? "sm-btn-quiet" : "sm-btn-accent sm-btn-lg"}`}
                onClick={() => camera.current?.click()}
              >
                {t("s.take")}
              </button>
              <button className="sm-btn sm-btn-quiet" onClick={() => gallery.current?.click()}>
                {t("s.upload")}
              </button>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="sm-drop sm-rise">
            <h2 className="sm-display">{t("s.failed")}</h2>
            {err && <p className="sm-err">{err}</p>}
            <button className="sm-btn sm-btn-accent" onClick={reset}>
              {t("s.take")}
            </button>
          </div>
        )}

        {stage === "reading" && (
          <div className="sm-analyzing sm-rise">
            <div className="sm-shot">{shot && <img src={shot} alt="" />}</div>
            <ul className="sm-steps-list">
              {[t("s.r1"), t("s.r2"), t("s.r3"), t("s.r4")].map((label, i) => (
                <li key={label} className={i <= step ? "on" : ""}>
                  <span className="sm-dot" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stage === "profile" && profile && (
          <div className="sm-rise">
            <div className="sm-shot sm-shot-still">{shot && <img src={shot} alt="" />}</div>
            <h2 className="sm-display" style={{ fontSize: "1.6rem", marginTop: 22 }}>
              {t("s.profile")}
            </h2>
            <div className="sm-profile">
              <div className="sm-fact sm-fact-cap">
                <b>{t("s.style")}</b>
                <span>{profile.style}</span>
              </div>
              <div className="sm-fact sm-fact-cap">
                <b>{t("s.light")}</b>
                <span>{profile.lighting}</span>
              </div>
              <div className="sm-fact">
                <b>{t("s.wall")}</b>
                <span>
                  {Math.round(profile.wallWidth)} × {Math.round(profile.wallHeight)} cm
                </span>
              </div>
              <div className="sm-fact">
                <b>{t("s.palette")}</b>
                <div className="sm-swatches">
                  {profile.dominantColors.slice(0, 5).map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            {profile.notes && <p className="sm-note">{profile.notes}</p>}

            {matches.length > 0 ? (
              <button
                className="sm-btn sm-btn-accent sm-btn-block sm-btn-lg"
                style={{ marginTop: 26 }}
                onClick={() => {
                  setStage("match");
                  track(tenant.slug, "view", { product_id: matches[0]?.id });
                }}
              >
                {t("s.see")}
              </button>
            ) : (
              <p className="sm-note">{t("s.empty")}</p>
            )}
          </div>
        )}

        {stage === "match" && current && profile && (
          <div className="sm-match sm-rise" key={current.id}>
            {preview && shot ? (
              <WallPreview room={shot} piece={current} profile={profile} />
            ) : (
              <figure className="sm-match-figure">
                {current.image_url ? <img src={current.image_url} alt="" /> : <div style={{ aspectRatio: "4/5" }} />}
                <figcaption className="sm-badge">
                  <em>{current.match}%</em> {t("s.match")}
                </figcaption>
              </figure>
            )}

            <h2 className="sm-display">{current.title}</h2>
            {current.price && (
              <div className="sm-match-price">
                {tenant.currency === "GBP" ? "£" : tenant.currency === "EUR" ? "€" : ""}
                {Number(current.price).toLocaleString()}
              </div>
            )}
            <p className="sm-why">{current.why}</p>
            {current.width_cm && current.height_cm && (
              <p className="sm-dims">
                {t("s.size")}: {Math.round(Number(current.width_cm))} × {Math.round(Number(current.height_cm))} cm
              </p>
            )}

            <div className="sm-match-actions">
              <button className="sm-btn sm-btn-accent sm-btn-block sm-btn-lg" onClick={() => setPreview((v) => !v)}>
                {preview ? t("s.hide") : t("s.preview")}
              </button>
              <div className="sm-secondary-row">
                <button
                  className="sm-btn sm-btn-quiet"
                  onClick={() => {
                    setPreview(false);
                    setIdx((i) => (i + 1) % matches.length);
                  }}
                >
                  {t("s.next")}
                </button>
                <button
                  className="sm-btn sm-btn-quiet"
                  onClick={() => {
                    track(tenant.slug, "click", { product_id: current.id });
                    setAsk(true);
                  }}
                >
                  {t("s.ask")}
                </button>
              </div>
              <button className="sm-link" onClick={() => setBrowse((v) => !v)}>
                {t("s.more")}
              </button>
            </div>

            {browse && (
              <div className="sm-alts">
                {[...matches, ...alts].map((p) => (
                  <button
                    key={p.id}
                    className="sm-alt"
                    onClick={() => {
                      const i = matches.findIndex((m) => m.id === p.id);
                      if (i >= 0) {
                        setIdx(i);
                      } else {
                        // Alternativa postaje glavna preporuka bez novog poziva
                        const full: Match = {
                          id: p.id,
                          sku: null,
                          title: p.title,
                          description: null,
                          image_url: p.image_url,
                          url: null,
                          price: p.price,
                          width_cm: p.width_cm,
                          height_cm: p.height_cm,
                          depth_cm: p.depth_cm,
                          model_url: p.model_url,
                          match: p.match,
                          why: (p as Match).why ?? "",
                        };
                        setMatches((m) => [...m, full]);
                        setIdx(matches.length);
                      }
                      setPreview(false);
                      setBrowse(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    {p.image_url && <img src={p.image_url} alt="" loading="lazy" />}
                    <span className="sm-alt-body">
                      <b>{p.title}</b>
                      <span>{p.match}% {t("s.match")}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button className="sm-link" style={{ marginTop: 26 }} onClick={reset}>
              {t("s.again")}
            </button>
          </div>
        )}
      </div>

      {stage === "live" && (
        <LiveScan
          tenant={tenant}
          onClose={() => setStage("start")}
          onPick={(f, p, m, a) => {
            // Zamrznut kadar postaje običan rezultat: isti pregled na zidu,
            // isti upit — kupac ne uči dva različita ekrana.
            setShot(f);
            setProfile(p);
            setMatches(m);
            setAlts(a);
            setIdx(0);
            setPreview(false);
            setStage("match");
          }}
        />
      )}

      {ask && current && (
        <Inquiry
          tenant={tenant}
          product={current}
          profile={profile}
          onClose={() => setAsk(false)}
        />
      )}
    </div>
  );
}

function Inquiry({
  tenant,
  product,
  profile,
  onClose,
}: {
  tenant: Tenant;
  product: Match;
  profile: RoomProfile | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState(product.title);
  const [state, setState] = useState<"" | "bad" | "sent">("");

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setState("bad");
      return;
    }
    try {
      await sendInquiry(tenant.slug, {
        name,
        email: email.trim(),
        phone,
        message: msg,
        product_ids: product.id,
        profile,
      });
      setState("sent");
    } catch {
      setState("bad");
    }
  };

  return (
    <div className="sm-sheet" onClick={onClose}>
      <div className="sm-sheet-card" onClick={(e) => e.stopPropagation()}>
        {state === "sent" ? (
          <>
            <h3 className="sm-display">{t("q.sent")}</h3>
            <button className="sm-btn sm-btn-block" onClick={onClose}>
              ✕
            </button>
          </>
        ) : (
          <>
            <h3 className="sm-display">{t("q.title")}</h3>
            <p className="sm-muted" style={{ fontSize: "0.9rem" }}>
              {t("q.sub")}
            </p>
            <div>
              <label htmlFor="q-name">{t("q.name")}</label>
              <input id="q-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            <div>
              <label htmlFor="q-mail">{t("q.email")}</label>
              <input
                id="q-mail"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setState("");
                }}
                autoComplete="email"
                inputMode="email"
              />
            </div>
            <div>
              <label htmlFor="q-phone">{t("q.phone")}</label>
              <input id="q-phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </div>
            <div>
              <label htmlFor="q-msg">{t("q.msg")}</label>
              <textarea id="q-msg" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} />
            </div>
            {state === "bad" && <p className="sm-err">{t("q.bad")}</p>}
            <button className="sm-btn sm-btn-accent sm-btn-block" onClick={submit}>
              {t("q.send")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
