import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * The API proxy target. Defaults to the Docker Compose service name for
 * Symfony's own inner nginx (http://backend:8080) but can be overridden via
 * the VITE_API_TARGET environment variable for local development (e.g.
 * http://localhost:8080).
 */
const apiTarget = process.env.VITE_API_TARGET ?? "http://backend:8080";

export default defineConfig(({ command }) => ({
  // Production builds are served through Apache's `Alias /MinCom-Appraisal
  // ".../public"` (this MAMP dev environment mounts the app off-root, not
  // at the domain root) — every asset path in the built index.html needs
  // that prefix, and `import.meta.env.BASE_URL` (which this populates)
  // is the single source of truth the rest of the app derives its own
  // base-path-aware paths from (see src/api/client.ts, src/App.tsx).
  // `npm run dev` stays at a clean root so the existing dev-proxy setup
  // below is unaffected.
  base: command === "build" ? "/MinCom-Appraisal/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    allowedHosts: [
      "localhost",
      ".ngrok.io",
      ".ngrok-free.dev",
      ".ngrok-free.app",
    ],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));
