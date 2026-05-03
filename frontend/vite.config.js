import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: false,
    // Cloudflare/ngrok/etc. send a foreign Host header; Vite 5+ blocks that unless allowed.
    allowedHosts: true,
    // Dev: same-origin /api and /admin → FastAPI (one tunnel to 5173 covers API + SQLAdmin).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/admin": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
