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
  // Defaults to root ("/") — matches how the real production nginx config
  // serves the SPA (docker/nginx/default.prod.conf's `location /` block
  // has no path prefix) and how a proper MAMP PRO virtual host mounts
  // `public/` as its document root. Override with VITE_BASE_PATH only for
  // an off-root deployment (e.g. an Apache `Alias /MinCom-Appraisal
  // ".../public"` setup, as this project's MAMP dev environment used
  // before it moved to a dedicated vhost). `import.meta.env.BASE_URL`
  // (which this populates) is the single source of truth the rest of the
  // app derives its own base-path-aware paths from (see
  // src/api/client.ts, src/App.tsx). `npm run dev` stays at a clean root
  // so the existing dev-proxy setup below is unaffected.
  //
  // CORRECTION: this used to be hardcoded to "/MinCom-Appraisal/" for
  // EVERY `npm run build`, including the one baked into the production
  // Docker image (docker/nginx/Dockerfile) — which would have broken the
  // real production deployment (all asset URLs and the router's
  // `basename` would carry a prefix nginx never strips), since it had
  // never actually been exercised against a live prod deployment yet.
  base: command === "build" ? (process.env.VITE_BASE_PATH ?? "/") : "/",
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
