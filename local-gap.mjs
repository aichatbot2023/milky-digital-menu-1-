/**
 * Šta lokalni detektor VIDI, a šta mu promiče.
 *
 * Oblak na istoj kuhinji nalazi sedam opasnosti. Ovo meri koliko od toga
 * uopšte može da vidi model u telefonu — jer u uživo režimu oblak stiže
 * svakih desetak sekundi i ume da padne, pa je lokalni sloj ono što roditelj
 * zaista gleda većinu vremena.
 */
import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto("http://127.0.0.1:5199/app/", { waitUntil: "domcontentloaded" });
const r = await p.evaluate(async (photo) => {
  const { detectLocal } = await import("/src/lib/detector.ts");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = photo;
  await new Promise((ok) => { img.onload = ok; });
  const hz = await detectLocal(img, img.naturalWidth, img.naturalHeight, "1-2y", { detail: "photo" });
  return {
    size: [img.naturalWidth, img.naturalHeight],
    found: hz.map((h) => ({ label: h.label, src: h.sourceClass, sev: h.severity, conf: +(h.confidence ?? 0).toFixed(2) })),
  };
}, process.env.PHOTO ?? "http://127.0.0.1:5200/kuhinja.jpg");
console.log(JSON.stringify(r, null, 1));
await b.close();
