/**
 * Oznaka partnerstva sa Amazonom.
 *
 * Rečenica koja se ovde ispisuje NIJE marketing nego obaveza: Amazon
 * Associates traži da na svakom mestu gde stoje partnerski linkovi piše da
 * vlasnik sajta zarađuje od kvalifikovanih kupovina. Preporuke proizvoda
 * postoje unutar aplikacije, pa oznaka mora da postoji i tu, ne samo na
 * ulaznoj strani.
 *
 * ZNAK (logo) SE NE CRTA OVDE, i to je namerno.
 * Amazon svoje ime i znak drži pod pravilima o žigu: partner ih sme koristiti
 * samo u obliku koji Amazon sam izda (kroz njihove alate za linkove i banere).
 * Nacrtan ili prekopiran logo je čest razlog gašenja partnerskog naloga — a
 * taj nalog je ovde izvor prihoda, pa je rizik neuporediv sa koristi.
 *
 * Zato postoji MESTO za zvaničnu sličicu: ako vlasnik preuzme baner iz svog
 * Associates naloga i snimi ga kao `public/amazon-associate.png`, pojaviće se
 * sam od sebe. Ako fajla nema, ostaje uredan tekst i ništa se ne lomi.
 */
import { useState } from "react";
import { t } from "../lib/i18n";

const BADGE = `${import.meta.env.BASE_URL}amazon-associate.png`;

export function AmazonPartner({ compact = false }: { compact?: boolean }) {
  const [hasBadge, setHasBadge] = useState(true);
  return (
    <p className={`amzn${compact ? " amzn-compact" : ""}`}>
      {hasBadge && (
        <img
          src={BADGE}
          alt=""
          className="amzn-badge"
          loading="lazy"
          onError={() => setHasBadge(false)}
        />
      )}
      <span>{t("amzn.note")}</span>
    </p>
  );
}
