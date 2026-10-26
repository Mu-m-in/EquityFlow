import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const validateProductionOrigins = (mode, env) => {
  if (mode !== "production") {
    return;
  }

  for (const name of ["VITE_API_URL", "VITE_FRONTEND_URL"]) {
    let url;
    try {
      url = new URL(env[name]);
    } catch {
      throw new Error(`${name} must be an HTTPS origin for production builds`);
    }
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error(`${name} must be an HTTPS origin for production builds`);
    }
  }
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  validateProductionOrigins(mode, env);

  return {
    server: {
      host: "localhost",
      port: Number(env.VITE_DEV_PORT) || undefined,
      strictPort: true,
    },
    plugins: [react(), tailwindcss()],
  };
});
