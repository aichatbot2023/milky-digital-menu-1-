/**
 * Prenesi izvršno okruženje za dubinu iz `node_modules` u `public/ort/`.
 *
 * Zašto skriptom, a ne fajlom u repozitorijumu: JavaScript deo dolazi iz
 * paketa i uparen je sa svojim `.wasm` fajlom. Da je `.wasm` zapisan u
 * repozitorijum, prvo podizanje verzije paketa bi ih razdvojilo — a to ne
 * puca glasno, nego se javi kao neobjašnjiva greška pri učitavanju modela.
 * Ovako uvek idu zajedno, i git ostaje lakši za jedanaest megabajta.
 *
 * Pokreće se samo od sebe pre `npm run dev` i `npm run build`.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "ort");

const files = ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"];

if (!existsSync(from)) {
  // Bez paketa se ne pravi buka: dubina je dodatak, a `npm install` sledi.
  console.warn("onnxruntime-web nije instaliran — dubina prostora se preskače");
  process.exit(0);
}

mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`ort → public/ort/ (${files.length} fajla)`);
