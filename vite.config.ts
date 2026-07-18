import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
