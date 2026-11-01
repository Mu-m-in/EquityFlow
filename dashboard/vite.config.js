import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const devPort = Number(env.VITE_DEV_PORT) || 5173;
  const apiTarget = env.TRADEHUB_API_ORIGIN || "http://localhost:3002";
  const apiTargetUrl = new URL(apiTarget);

  if (
    !/^https?:$/.test(apiTargetUrl.protocol) ||
    apiTargetUrl.pathname !== "/" ||
    apiTargetUrl.search ||
    apiTargetUrl.hash ||
    apiTargetUrl.username ||
    apiTargetUrl.password
  ) {
    throw new Error("TRADEHUB_API_ORIGIN must be an origin URL");
  }

  return {
    server: {
      host: "localhost",
      port: devPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTargetUrl.origin,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyRequest) => {
              proxyRequest.setHeader("Origin", `http://localhost:${devPort}`);
            });
          },
        },
      },
    },
    plugins: [react(), tailwindcss()],
  };
});
