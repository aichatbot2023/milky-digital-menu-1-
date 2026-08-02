/**
 * SpaceMatch AI — widget za ugradnju na sajt zakupca.
 *
 *   <script src="https://safenessai.co.uk/spacematch.js" data-studio="demo" defer></script>
 *
 * Dodaje plutajuće dugme; klik otvara skener preko celog ekrana u iframe-u.
 * Namerno bez ijedne zavisnosti i bez globalnih stilova — sve je u
 * inline stilovima i Shadow DOM-u, pa ne može da pokvari sajt domaćina.
 *
 * Opcije (data- atributi):
 *   data-studio    obavezno — link (slug) studija
 *   data-label     tekst dugmeta
 *   data-color     boja dugmeta
 *   data-position  "right" (podrazumevano) ili "left"
 *   data-lang      "en" | "sr"
 */
(function () {
  "use strict";
  var el = document.currentScript;
  if (!el) return;
  var studio = el.getAttribute("data-studio");
  if (!studio) return;

  var origin = new URL(el.src, location.href).origin;
  var label = el.getAttribute("data-label") || "See it in your space";
  var color = el.getAttribute("data-color") || "#111827";
  var left = el.getAttribute("data-position") === "left";
  var lang = el.getAttribute("data-lang");

  var src =
    origin + "/spacematch/?t=" + encodeURIComponent(studio) + "&embed=1" + (lang ? "&lang=" + lang : "");

  var host = document.createElement("div");
  host.setAttribute("data-spacematch", studio);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent =
    ":host{all:initial}" +
    ".b{position:fixed;bottom:22px;" + (left ? "left" : "right") + ":22px;z-index:2147483000;" +
    "display:inline-flex;align-items:center;gap:9px;border:none;border-radius:999px;" +
    "padding:14px 22px;font:700 15px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
    "color:#fff;background:" + color + ";cursor:pointer;" +
    "box-shadow:0 10px 30px rgba(0,0,0,.28);transition:transform .18s cubic-bezier(.34,1.56,.64,1)}" +
    ".b:active{transform:scale(.96)}" +
    ".o{position:fixed;inset:0;z-index:2147483001;background:rgba(17,24,39,.6);display:none}" +
    ".o.on{display:block}" +
    ".f{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fbfaf8}" +
    ".x{position:absolute;top:calc(12px + env(safe-area-inset-top));" + (left ? "right" : "left") + ":12px;" +
    "z-index:2;width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;" +
    "background:rgba(255,255,255,.94);font-size:19px;line-height:38px;color:#111827;padding:0}" +
    "@media (prefers-reduced-motion:reduce){.b{transition:none}}";

  var btn = document.createElement("button");
  btn.className = "b";
  btn.type = "button";
  btn.textContent = label;

  var overlay = document.createElement("div");
  overlay.className = "o";

  var close = document.createElement("button");
  close.className = "x";
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.textContent = "✕";

  var frame = null;

  btn.addEventListener("click", function () {
    if (!frame) {
      frame = document.createElement("iframe");
      frame.className = "f";
      frame.setAttribute("allow", "camera; clipboard-write");
      frame.setAttribute("title", "SpaceMatch AI");
      frame.src = src;
      overlay.appendChild(frame);
    }
    overlay.classList.add("on");
    document.documentElement.style.overflow = "hidden";
  });

  function hide() {
    overlay.classList.remove("on");
    document.documentElement.style.overflow = "";
  }
  close.addEventListener("click", hide);
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data === "spacematch:close") hide();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hide();
  });

  overlay.appendChild(close);
  root.appendChild(style);
  root.appendChild(btn);
  root.appendChild(overlay);

  (document.body || document.documentElement).appendChild(host);
})();
