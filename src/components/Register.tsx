import { useState } from "react";
import { registerAccount } from "../lib/subscription";
import { t } from "../lib/i18n";
import { Logo } from "./Logo";

interface Props {
  onDone: () => void;
}

// Obavezna registracija pre korišćenja: ime + email → CRM (sa referral
// atribucijom) i početak 7-dnevnog probnog perioda od ovog trenutka.
export function Register({ onDone }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
      setError(true);
      return;
    }
    registerAccount(name.trim(), em);
    onDone();
  };

  return (
    <div className="register-screen">
      <div className="register-card stagger">
        <div className="register-shield"><Logo size={60} /></div>
        <h1>{t("reg.title")}</h1>
        <p className="muted">{t("reg.sub")}</p>

        <input
          type="text"
          placeholder={t("reg.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <input
          type="email"
          placeholder={t("reg.email")}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoComplete="email"
          inputMode="email"
        />
        {error && <p className="warn">{t("reg.invalid")}</p>}

        <button className="btn btn-primary" onClick={submit} disabled={!email.trim()}>
          {t("reg.cta")}
        </button>

        <p className="register-gdpr">{t("reg.gdpr")}</p>
      </div>
    </div>
  );
}
