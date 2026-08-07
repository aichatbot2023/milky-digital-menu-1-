/**
 * Ulaz u departman za ljubimce.
 *
 * Jedina razlika u odnosu na dečji ulaz je JEDAN red: `setDomain("pet")`.
 * Sve ostalo — detektor, pratilac predmeta, prosuđivanje po prostoru, prikaz
 * rešenja na svom mestu, procena cele prostorije, učenje od korisnika — je
 * isti kod. Zato se svaka popravka u jednom departmanu odmah vidi i u
 * drugom, a to je jedini način da oba ostanu ispravna.
 *
 * Prekidač se postavlja PRE prvog crtanja: baza znanja se bira pri prvoj
 * detekciji, i ako bi domen stigao kasnije, prvi nalaz bi bio iz pogrešnog
 * sveta.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { setDomain } from "../lib/domain";
import { loadLocale } from "../lib/i18n";
import "@fontsource-variable/nunito";
import "@fontsource-variable/fraunces";
import "../index.css";
import "../motion.css";
import "./pets.css";

setDomain("pet");

loadLocale().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch(() => {});
}
