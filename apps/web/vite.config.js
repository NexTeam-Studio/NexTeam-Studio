import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, "../..");
  const env = loadEnv(mode, repoRoot, "");
  const anthropicKey = env.ANTHROPIC_API_KEY || "";
  const localApiProxyTarget = env.LOCAL_API_PROXY_TARGET || "http://127.0.0.1:3001";
  const localApiProxy = {
    target: localApiProxyTarget,
    changeOrigin: true
  };

  return {
    plugins: [react()],
    server: {
      port: process.env.PORT || 5173,
      host: "0.0.0.0",
      proxy: {
        "/auth/google": localApiProxy,
        "/api/public": localApiProxy,
        "/api/crm": localApiProxy,
        "/api/scheduling": localApiProxy,
        "/api/content": localApiProxy,
        "/api/reputation": localApiProxy,
        "/api/approvals": localApiProxy,
        "/api/media": localApiProxy,
        "/api/nexi": localApiProxy,
        "/api/platform": localApiProxy,
        "/api/voice": localApiProxy,
        "/api/gbp": localApiProxy,
        "/api/vgb": localApiProxy,
        "/api/bragi": localApiProxy,
        "/api/anthropic": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/api\/anthropic/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (anthropicKey) {
                proxyReq.setHeader("x-api-key", anthropicKey);
                proxyReq.setHeader("anthropic-version", "2023-06-01");
              }
            });
          }
        },
        "/elevenlabs": {
          target: "https://api.elevenlabs.io",
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/elevenlabs/, "")
        }
      }
    },
    preview: {
      port: process.env.PORT || 4173,
      host: "0.0.0.0",
      allowedHosts: ["all"]
    }
  };
});
