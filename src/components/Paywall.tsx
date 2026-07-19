import { useState } from "react";
import {
  CHECKOUT_URL,
  CONTACT_EMAIL,
  PRICE_LABEL,
  redeemCode,
} from "../lib/subscription";

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
      // ?session_id=... i Premium se aktivira automatski
      window.location.href = CHECKOUT_URL;
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
        <h2>⭐ SafeNest AI Premium</h2>
        <p className="muted">
          {expired
            ? "Vaših 7 besplatnih dana je isteklo. Nastavite da štitite svoj dom uz Premium."
            : "Prvih 7 dana je potpuno besplatno — bez kartice. Posle toga:"}
        </p>

        <div className="paywall-price">
          <strong>{PRICE_LABEL}</strong>
          <span className="muted">otkažite bilo kada</span>
        </div>

        <ul className="paywall-benefits">
          <li>🎥 Neograničeno uživo skeniranje sa AI objašnjenjima</li>
          <li>🔬 Precizna višeslojna analiza fotografija (i sitni predmeti)</li>
          <li>🎤 Glasovni AI asistent za bezbednost, 24/7</li>
          <li>🧠 Aplikacija uči iz vaših ocena i postaje preciznija</li>
          <li>👶 Profili za više dece, prilagođeno uzrastu</li>
        </ul>

        <button className="btn btn-primary" onClick={subscribe}>
          Pretplati se — {PRICE_LABEL}
        </button>

        <p className="muted">
          Posle uplate bićete automatski vraćeni u aplikaciju i Premium se
          uključuje sam — bez ikakvih kodova.
        </p>

        <div className="paywall-code">
          <p className="muted">Rezervna opcija — imate aktivacioni kod?</p>
          <div className="va-textrow">
            <input
              placeholder="npr. SAFENEST-…"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryCode()}
            />
            <button className="btn btn-outline" onClick={tryCode} disabled={!code.trim()}>
              Aktiviraj
            </button>
          </div>
          {codeError && <p className="warn">Kod nije prepoznat. Proverite unos.</p>}
        </div>

        <button className="btn btn-ghost" onClick={onClose}>
          {expired ? "Ne sada" : "Zatvori"}
        </button>
      </div>
    </div>
  );
}
