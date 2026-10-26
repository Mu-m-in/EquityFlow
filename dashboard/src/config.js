const deploymentUrl = (value, name) => {
  if (!value) {
    if (import.meta.env.PROD) {
      throw new Error(`${name} must be configured for production builds`);
    }
    return "";
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }

  if (
    !/^https?:$/.test(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (import.meta.env.PROD && url.protocol !== "https:")
  ) {
    throw new Error(`${name} must be an HTTPS origin in production`);
  }
  return url.origin;
};

export const API_URL = deploymentUrl(
  import.meta.env.VITE_API_URL,
  "VITE_API_URL",
);
export const FRONTEND_URL = deploymentUrl(
  import.meta.env.VITE_FRONTEND_URL,
  "VITE_FRONTEND_URL",
);
