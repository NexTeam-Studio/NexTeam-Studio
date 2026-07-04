import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const anthropicKey = env.ANTHROPIC_API_KEY || "";
  const localApiProxyTarget = env.LOCAL_API_PROXY_TARGET || "http://127.0.0.1:3001";

  return {
    plugins: [react()],
    server: {
      port: process.env.PORT || 5173,
      host: "0.0.0.0",
      proxy: {
        "/auth/google": {
          target: localApiProxyTarget,
          changeOrigin: true
        },
        "/api/gbp": {
          target: localApiProxyTarget,
          changeOrigin: true
        },
        "/api/vgb": {
          target: localApiProxyTarget,
          changeOrigin: true
        },
        "/api/bragi": {
          target: localApiProxyTarget,
          changeOrigin: true
        },
        "/api/anthropic": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ""),
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
          rewrite: (path) => path.replace(/^\/elevenlabs/, "")
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
