import http from "node:http";
import https from "node:https";
import process from "node:process";

const backendOrigin = "https://equityflow-fhkv.onrender.com";
const dashboardOrigin = "https://equityflow-dashboard.vercel.app";
const routeParameter = "__api_path";
const dashboardCookieName = "tradehub_dashboard_session";

const endpointRules = [
  { pattern: /^\/dashboard\/auth\/login$/, methods: ["POST"] },
  { pattern: /^\/dashboard\/auth\/logout$/, methods: ["POST"] },
  { pattern: /^\/dashboard\/auth\/me$/, methods: ["GET"] },
  { pattern: /^\/watchlist$/, methods: ["GET", "POST"] },
  { pattern: /^\/watchlist\/[^/]+$/, methods: ["DELETE"] },
  { pattern: /^\/market\/search$/, methods: ["GET"] },
  { pattern: /^\/market\/history\/[^/]+$/, methods: ["GET"] },
  { pattern: /^\/funds$/, methods: ["GET"] },
  { pattern: /^\/portfolio$/, methods: ["GET"] },
  { pattern: /^\/orders$/, methods: ["GET", "POST"] },
  { pattern: /^\/allHoldings$/, methods: ["GET"] },
  { pattern: /^\/allPositions$/, methods: ["GET"] },
];

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const sendJson = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
};

const getDashboardCookie = (cookieHeader) => {
  if (typeof cookieHeader !== "string") {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${dashboardCookieName}=`));
};

const parseHttpsOrigin = (value) => {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.origin !== value ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

export const getDeploymentOrigin = (environment) => {
  if (environment.VERCEL_ENV === "production") {
    return dashboardOrigin;
  }
  if (environment.VERCEL_ENV !== "preview") {
    return null;
  }

  const deploymentHost = environment.VERCEL_URL;
  if (
    typeof deploymentHost !== "string" ||
    !deploymentHost ||
    deploymentHost.includes("/")
  ) {
    return null;
  }

  const url = parseHttpsOrigin(`https://${deploymentHost}`);
  return url?.host === deploymentHost.toLowerCase() ? url.origin : null;
};

export const getConfiguredUpstream = (environment) => {
  if (environment.VERCEL_ENV === "production") {
    return backendOrigin;
  }
  if (environment.VERCEL_ENV !== "preview" || !environment.TRADEHUB_API_ORIGIN) {
    return null;
  }

  const url = parseHttpsOrigin(environment.TRADEHUB_API_ORIGIN);
  if (!url) {
    throw new Error("Preview upstream must be an HTTPS API origin");
  }
  if (
    url.origin === backendOrigin &&
    environment.ALLOW_PRODUCTION_PREVIEW_API !== "true"
  ) {
    throw new Error(
      "Production API access from Preview requires explicit opt-in",
    );
  }
  return url.origin;
};

const isAllowedRequestOrigin = (request, deploymentOrigin) => {
  const host = request.headers.host;
  if (typeof host !== "string") {
    return false;
  }

  let requestUrl;
  try {
    requestUrl = new URL(`https://${host}`);
  } catch {
    return false;
  }
  if (
    requestUrl.origin !== deploymentOrigin ||
    requestUrl.pathname !== "/" ||
    requestUrl.search ||
    requestUrl.hash ||
    requestUrl.username ||
    requestUrl.password
  ) {
    return false;
  }

  const origin = request.headers.origin;
  const referer = request.headers.referer;
  const requiresOrigin = ["POST", "PUT", "PATCH", "DELETE"].includes(
    request.method,
  );
  if (requiresOrigin && !origin) {
    return false;
  }
  if (origin && origin !== deploymentOrigin) {
    return false;
  }
  if (referer) {
    let refererOrigin;
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.username || refererUrl.password) {
        return false;
      }
      refererOrigin = refererUrl.origin;
    } catch {
      return false;
    }
    if (refererOrigin !== deploymentOrigin) {
      return false;
    }
  }

  return true;
};

const getEndpointRule = (path) =>
  endpointRules.find(({ pattern }) => pattern.test(path));

const getBackendPath = (path) => {
  if (
    path === "/dashboard/orders" ||
    path === "/dashboard/watchlist" ||
    path.startsWith("/dashboard/watchlist/")
  ) {
    return path.replace(/^\/dashboard(?=\/)/, "");
  }
  return path;
};

const canonicalizeRoutePath = (path, { rejectEncodedSeparators = false } = {}) => {
  if (typeof path !== "string" || !path) {
    return null;
  }
  if (rejectEncodedSeparators && /%(?:2f|5c)/i.test(path)) {
    return null;
  }

  let decodedPath = path;
  for (let depth = 0; depth < 8; depth += 1) {
    let nextPath;
    try {
      nextPath = decodeURIComponent(decodedPath);
    } catch {
      return null;
    }
    if (nextPath === decodedPath) {
      break;
    }
    decodedPath = nextPath;
    if (depth === 7) {
      return null;
    }
  }

  if (
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    decodedPath.includes("?") ||
    decodedPath.includes("#")
  ) {
    return null;
  }

  const segments = decodedPath.split("/");
  if (segments[0] === "") {
    segments.shift();
  }
  if (
    !segments.length ||
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
};

const getRawQueryValues = (requestUrl, name) => {
  const query = requestUrl.split("?", 2)[1]?.split("#", 1)[0];
  if (!query) {
    return [];
  }

  const values = [];
  for (const parameter of query.split("&")) {
    const [rawName, ...rawValueParts] = parameter.split("=");
    let decodedName;
    try {
      decodedName = decodeURIComponent(rawName.replace(/\+/g, " "));
    } catch {
      continue;
    }
    if (decodedName === name) {
      values.push(rawValueParts.join("="));
    }
  }
  return values;
};

const normalizeApiRequest = (requestUrl, rawRequestUrl) => {
  const routedPaths = requestUrl.searchParams.getAll(routeParameter);
  const rawRoutedPaths = getRawQueryValues(rawRequestUrl, routeParameter);
  const rawPath = rawRequestUrl.split(/[?#]/, 1)[0];
  let upstreamPath;

  if (rawPath === "/api/proxy") {
    const rawRoutePath = rawRoutedPaths[0]?.replace(/\+/g, " ");
    if (
      routedPaths.length !== 1 ||
      rawRoutedPaths.length !== 1 ||
      !canonicalizeRoutePath(routedPaths[0]) ||
      canonicalizeRoutePath(routedPaths[0]) !==
        canonicalizeRoutePath(rawRoutePath)
    ) {
      return null;
    }
    upstreamPath = canonicalizeRoutePath(routedPaths[0]);
    requestUrl.searchParams.delete(routeParameter);
  } else if (rawPath.startsWith("/api/")) {
    const originalPath = canonicalizeRoutePath(
      rawPath.slice("/api".length),
      { rejectEncodedSeparators: true },
    );
    if (!originalPath) {
      return null;
    }
    if (routedPaths.length) {
      const rawRoutePath = rawRoutedPaths[0]?.replace(/\+/g, " ");
      if (
        routedPaths.length !== 1 ||
        rawRoutedPaths.length !== 1 ||
        !canonicalizeRoutePath(routedPaths[0]) ||
        canonicalizeRoutePath(routedPaths[0]) !==
          canonicalizeRoutePath(rawRoutePath) ||
        canonicalizeRoutePath(routedPaths[0]) !== originalPath
      ) {
        return null;
      }
      requestUrl.searchParams.delete(routeParameter);
    } else if (rawRoutedPaths.length) {
      return null;
    }
    upstreamPath = originalPath;
  } else {
    return null;
  }

  if (!upstreamPath) {
    return null;
  }

  return upstreamPath;
};

export const createDashboardProxy = ({
  upstreamOrigin,
  deploymentOrigin,
  expectedBackendOrigin = dashboardOrigin,
  readOnlyPreview = false,
}) => {
  const upstream = new URL(upstreamOrigin);
  const deployedOrigin = parseHttpsOrigin(deploymentOrigin);
  if (
    !["http:", "https:"].includes(upstream.protocol) ||
    upstream.pathname !== "/" ||
    upstream.search ||
    upstream.hash ||
    upstream.username ||
    upstream.password
  ) {
    throw new Error("The proxy upstream must be an origin URL");
  }
  if (!deployedOrigin) {
    throw new Error("The dashboard deployment origin must be HTTPS");
  }

  const transport = upstream.protocol === "https:" ? https : http;

  return (request, response) => {
    if (!isAllowedRequestOrigin(request, deployedOrigin.origin)) {
      return sendJson(response, 403, { message: "Origin not allowed" });
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url, "http://dashboard.local");
    } catch {
      return sendJson(response, 400, { message: "Invalid request URL" });
    }

    const upstreamPath = normalizeApiRequest(requestUrl, request.url);
    if (!upstreamPath) {
      return sendJson(response, 404, { message: "Not found" });
    }

    const backendPath = getBackendPath(upstreamPath);
    const endpointRule = getEndpointRule(backendPath);
    if (!endpointRule) {
      return sendJson(response, 404, { message: "Not found" });
    }
    const previewMethodAllowed = readOnlyPreview
      ? request.method === "POST"
        ? ["/dashboard/auth/login", "/dashboard/auth/logout"].includes(
            backendPath,
          )
        : ["GET", "HEAD"].includes(request.method) &&
          endpointRule.methods.includes("GET")
      : endpointRule.methods.includes(request.method);
    if (!previewMethodAllowed) {
      return sendJson(
        response,
        405,
        { message: "Method not allowed" },
        { allow: endpointRule.methods.join(", ") },
      );
    }

    const headers = { origin: expectedBackendOrigin };
    for (const name of ["accept", "content-type", "content-length"]) {
      const value = request.headers[name];
      if (value !== undefined) {
        headers[name] = value;
      }
    }

    const dashboardCookie = getDashboardCookie(request.headers.cookie);
    if (dashboardCookie) {
      headers.cookie = dashboardCookie;
    }

    const upstreamRequest = transport.request(
      {
        hostname: upstream.hostname,
        port: upstream.port || undefined,
        path: `${backendPath}${requestUrl.search}`,
        method: request.method,
        headers,
      },
      (upstreamResponse) => {
        const responseHeaders = {};
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (
            hopByHopHeaders.has(name) ||
            name.startsWith("access-control-")
          ) {
            continue;
          }
          responseHeaders[name] = value;
        }

        response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
        upstreamResponse.pipe(response);
      },
    );

    upstreamRequest.on("error", () => {
      if (!response.headersSent) {
        sendJson(response, 502, { message: "Dashboard API unavailable" });
      } else if (!response.destroyed) {
        response.destroy();
      }
    });

    request.on("aborted", () => upstreamRequest.destroy());
    response.on("close", () => {
      if (!response.writableEnded) {
        upstreamRequest.destroy();
      }
    });

    request.pipe(upstreamRequest);
  };
};

export default function dashboardApi(request, response) {
  const environment = process.env;
  const deploymentOrigin = getDeploymentOrigin(environment);
  if (!deploymentOrigin) {
    return sendJson(response, 403, { message: "Deployment origin not allowed" });
  }

  let upstreamOrigin;
  try {
    upstreamOrigin = getConfiguredUpstream(environment);
  } catch {
    return sendJson(response, 500, { message: "Dashboard API misconfigured" });
  }

  if (!upstreamOrigin) {
    return sendJson(response, 503, {
      message: "A Preview-only isolated API origin must be configured",
    });
  }

  return createDashboardProxy({
    upstreamOrigin,
    deploymentOrigin,
    readOnlyPreview: environment.VERCEL_ENV === "preview",
  })(request, response);
}
