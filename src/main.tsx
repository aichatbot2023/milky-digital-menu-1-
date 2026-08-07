import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadLocale } from "./lib/i18n";
// Font je SPAKOVAN u aplikaciju (bez spoljnih zahteva; SW ga kešira offline)
import "@fontsource-variable/nunito";
import "@fontsource-variable/fraunces";
import "./index.css";
import "./motion.css";

// Rečnik izabranog jezika mora da stigne PRE prvog crtanja, inače aplikacija
// bljesne na engleskom pa se prevede — što na sporoj vezi izgleda kao greška.
loadLocale().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

// Service worker: keširanje modela i asseta → ponovna otvaranja su trenutna
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch(() => {});
}
