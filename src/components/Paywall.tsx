import { useState } from "react";
import {
  CHECKOUT_URL,
  CONTACT_EMAIL,
  PRICE_LABEL,
  checkoutUrl,
  redeemCode,
} from "../lib/subscription";
import { t } from "../lib/i18n";

interface Props {
  expired: boolean;
  onClose: () => void;
  onSubscribed: () => void;
}

// Ekran pretplate: prednosti + cena + aktivacioni kod posle uplate
export function Paywall({ expired, onClose, onSubscribed }: Props) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);

  const subscribe = () => {
    if (CHECKOUT_URL) {
      // Isti tab: posle uplate Stripe vraća korisnika na sajt sa
      // ?session_id=...; client_reference_id nosi partnera (referral)
      window.location.href = checkoutUrl();
    } else {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=SafeNest%20AI%20pretplata&body=Zdravo,%20želim%20da%20se%20pretplatim%20na%20SafeNest%20AI%20(${encodeURIComponent(PRICE_LABEL)}).`;
    }
  };

  const tryCode = () => {
    if (redeemCode(code)) {
      setCodeError(false);
      onSubscribed();
    } else {
      setCodeError(true);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet paywall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>{t("paywall.title")}</h2>
        <p className="muted">
          {expired ? t("paywall.expired") : t("paywall.trial")}
        </p>

        <div className="paywall-price">
          <strong>{t("paywall.price")}</strong>
          <span className="muted">{t("paywall.cancel")}</span>
        </div>

        <ul className="paywall-benefits">
          <li>{t("paywall.b1")}</li>
          <li>{t("paywall.b2")}</li>
          <li>{t("paywall.b3")}</li>
          <li>{t("paywall.b4")}</li>
          <li>{t("paywall.b5")}</li>
        </ul>

        <button className="btn btn-primary" onClick={subscribe}>
          {t("paywall.subscribe")} {t("paywall.price")}
        </button>

        <p className="muted">{t("paywall.autoNote")}</p>

        <div className="paywall-code">
          <p className="muted">{t("paywall.codePrompt")}</p>
          <div className="va-textrow">
            <input
              placeholder="npr. SAFENEST-…"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryCode()}
            />
            <button className="btn btn-outline" onClick={tryCode} disabled={!code.trim()}>
              {t("paywall.activate")}
            </button>
          </div>
          {codeError && <p className="warn">{t("paywall.codeError")}</p>}
        </div>

        <button className="btn btn-ghost" onClick={onClose}>
          {expired ? t("paywall.notNow") : t("paywall.closeBtn")}
        </button>
      </div>
    </div>
  );
}
