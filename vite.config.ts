import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Četiri stranice: landing (/), deca (/app/), ljubimci (/pets/),
  // odeljenje za nameštaj (/spacematch/)
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        app: resolve(__dirname, "app/index.html"),
        spacematch: resolve(__dirname, "spacematch/index.html"),
        pets: resolve(__dirname, "pets/index.html"),
      },
    },
  },
  // BASE_PATH se postavlja u CI za GitHub Pages (/<ime-repoa>/)
  base: process.env.BASE_PATH || "/",
  // Verzija vidljiva u aplikaciji — da uvek znamo koja verzija radi na uređaju
  define: {
    __APP_VERSION__: JSON.stringify(
      (process.env.GITHUB_SHA || "dev").slice(0, 7),
    ),
  },
  plugins: [react()],
  server: {
    port: 5173,
  },
});
