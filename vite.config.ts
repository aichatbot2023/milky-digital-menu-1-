import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // BASE_PATH se postavlja u CI za GitHub Pages (/<ime-repoa>/)
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
