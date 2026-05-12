import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Forward original host/proto so FastAPI / SQLAdmin behind this proxy build correct URLs & cookies (Cloudflare trycloudflare, ngrok, etc.). */
function proxyToBackend() {
  return {
    target: "http://127.0.0.1:8000",
    // Keep browser Host (e.g. *.trycloudflare.com); changeOrigin:true breaks /admin sessions & redirects.
    changeOrigin: false,
    secure: false,
    ws: true,
    configure(proxy) {
      proxy.on("proxyReq", (proxyReq, req) => {
        const host = req.headers.host;
        if (host) {
          proxyReq.setHeader("X-Forwarded-Host", host);
        }
        let proto = req.headers["x-forwarded-proto"];
        if (Array.isArray(proto)) {
          proto = proto[0];
        }
        if (
          !proto &&
          typeof host === "string" &&
          (host.includes("trycloudflare.com") ||
            host.includes("ngrok") ||
            host.endsWith(".loca.lt"))
        ) {
          proto = "https";
        }
        if (proto) {
          proxyReq.setHeader("X-Forwarded-Proto", proto);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: false,
    // Cloudflare/ngrok/etc. send a foreign Host header; Vite 5+ blocks that unless allowed.
    allowedHosts: true,
    // Dev: same-origin /api and /admin → FastAPI (tunnel to 5173 covers API + SQLAdmin).
    proxy: {
      "/api": proxyToBackend(),
      "/admin": proxyToBackend(),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
