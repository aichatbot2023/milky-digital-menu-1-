/**
 * Pristanak da isečci pomognu učenju modela.
 *
 * Tekst je napisan da ga roditelj razume bez pravnika, i da ne nagovara.
 * Prekidač stoji na ISKLJUČENO i tako ostaje dok ga neko svesno ne pomeri —
 * jer aplikacija koja traži poverenje ne sme da uzima ćutanje kao pristanak.
 *
 * Ovde se namerno NE piše koliko bi to pomoglo i koliko je važno. Kad se uz
 * pitanje o slikama iz nečije kuće doda ubeđivanje, to više nije pitanje.
 */
import { useState } from "react";
import { contributes, setContributes } from "../lib/contribute";
import { t } from "../lib/i18n";

export function ContributeToggle() {
  const [on, setOn] = useState(() => contributes());
  return (
    <div className="room-picker">
      <h3>{t("give.title")}</h3>
      <p className="muted">{t("give.note")}</p>
      <label className="give-row">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setContributes(e.target.checked);
            setOn(e.target.checked);
          }}
        />
        <span>{t("give.opt")}</span>
      </label>
      {on && <p className="give-what">{t("give.what")}</p>}
    </div>
  );
}
