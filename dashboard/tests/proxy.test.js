import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";
import {
  createDashboardProxy,
  getConfiguredUpstream,
  getDeploymentOrigin,
} from "../api/proxy.js";

const dashboardOrigin = "https://equityflow-dashboard.vercel.app";
const previewOrigin =
  "https://equityflow-dashboard-git-auth-fix-example.vercel.app";

const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
};

const close = async (server) => {
  server.close();
  await once(server, "close");
};

const applyDashboardRewrite = (path) => {
  const requestUrl = new URL(path, "https://dashboard.test");
  const apiPath = requestUrl.pathname.slice("/api/".length);
  const rewrittenUrl = new URL("/api/proxy", "https://dashboard.test");
  rewrittenUrl.searchParams.set("__api_path", apiPath);
  requestUrl.searchParams.forEach((value, key) => {
    rewrittenUrl.searchParams.append(key, value);
  });
  return `${rewrittenUrl.pathname}${rewrittenUrl.search}`;
};

const request = (
  port,
  {
    path,
    method = "GET",
    headers = {},
    body,
    rewrite = true,
    host = new URL(dashboardOrigin).host,
  } = {},
) =>
  new Promise((resolve, reject) => {
    const outgoing = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: rewrite ? applyDashboardRewrite(path) : path,
        method,
        headers: { host, ...headers },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    outgoing.on("error", reject);
    if (body !== undefined) {
      outgoing.write(body);
    }
    outgoing.end();
  });

test("proxies dashboard login and preserves secure host-only cookies", async (t) => {
  let received;
  const upstream = http.createServer((incoming, response) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      received = {
        method: incoming.method,
        url: incoming.url,
        origin: incoming.headers.origin,
        cookie: incoming.headers.cookie,
        body: Buffer.concat(chunks).toString(),
      };
      response.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": [
          "tradehub_dashboard_session=test-token; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=None",
          "tradehub_dashboard_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None",
        ],
      });
      response.end(JSON.stringify({ user: { id: "test-user" } }));
    });
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const proxy = createDashboardProxy({
    upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
    deploymentOrigin: dashboardOrigin,
  });
  const server = http.createServer(proxy);
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const body = JSON.stringify({ email: "test@example.test", password: "local-only" });
  const response = await request(proxyPort, {
    path: "/api/dashboard/auth/login?source=test",
    method: "POST",
    headers: {
      origin: dashboardOrigin,
      "content-type": "application/json",
      cookie:
        "equityflow_session=must-not-forward; tradehub_dashboard_session=dashboard-token",
      "content-length": Buffer.byteLength(body),
    },
    body,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, {
    method: "POST",
    url: "/dashboard/auth/login?source=test",
    origin: dashboardOrigin,
    cookie: "tradehub_dashboard_session=dashboard-token",
    body,
  });
  assert.deepEqual(response.headers["set-cookie"], [
    "tradehub_dashboard_session=test-token; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=None",
    "tradehub_dashboard_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None",
  ]);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("forwards dashboard session cookies for protected requests and logout", async (t) => {
  const received = [];
  const upstream = http.createServer((incoming, response) => {
    received.push({
      method: incoming.method,
      url: incoming.url,
      cookie: incoming.headers.cookie,
      origin: incoming.headers.origin,
    });
    response.writeHead(incoming.url.startsWith("/dashboard/auth/logout") ? 204 : 200, {
      "set-cookie": [
        "tradehub_dashboard_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None",
      ],
    });
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const me = await request(proxyPort, {
    path: "/api/dashboard/auth/me",
    headers: {
      origin: dashboardOrigin,
      cookie:
        "equityflow_session=must-not-forward; tradehub_dashboard_session=dashboard-token",
    },
  });
  const logout = await request(proxyPort, {
    path: "/api/dashboard/auth/logout",
    method: "POST",
    headers: {
      origin: dashboardOrigin,
      cookie:
        "equityflow_session=must-not-forward; tradehub_dashboard_session=dashboard-token",
    },
  });

  assert.equal(me.statusCode, 200);
  assert.equal(logout.statusCode, 204);
  assert.deepEqual(received, [
    {
      method: "GET",
      url: "/dashboard/auth/me",
      cookie: "tradehub_dashboard_session=dashboard-token",
      origin: dashboardOrigin,
    },
    {
      method: "POST",
      url: "/dashboard/auth/logout",
      cookie: "tradehub_dashboard_session=dashboard-token",
      origin: dashboardOrigin,
    },
  ]);
  assert.match(
    logout.headers["set-cookie"][0],
    /tradehub_dashboard_session=; Max-Age=0; Path=\/; HttpOnly; Secure; SameSite=None/,
  );
});

test("forwards every dashboard data endpoint with its method and query string", async (t) => {
  const proxied = [];
  const upstream = http.createServer((incoming, response) => {
    proxied.push(`${incoming.method} ${incoming.url}`);
    response.writeHead(
      incoming.url === "/dashboard/auth/me" && !incoming.headers.cookie
        ? 401
        : 200,
    );
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const endpoints = [
    ["GET", "/dashboard/auth/me"],
    ["GET", "/watchlist"],
    ["POST", "/watchlist"],
    ["DELETE", "/watchlist/INFY"],
    ["GET", "/market/search?keywords=Infosys"],
    ["GET", "/market/history/INFY"],
    ["GET", "/orders"],
    ["POST", "/orders"],
    ["GET", "/allHoldings"],
    ["GET", "/allPositions"],
    ["GET", "/portfolio"],
    ["GET", "/funds"],
  ];

  for (const [method, path] of endpoints) {
    const response = await request(proxyPort, {
      path: `/api${path}`,
      method,
      headers: { origin: dashboardOrigin },
    });
    assert.equal(
      response.statusCode,
      method === "GET" && path === "/dashboard/auth/me" ? 401 : 200,
      `${method} ${path}`,
    );
  }

  assert.deepEqual(
    proxied,
    endpoints.map(([method, path]) => `${method} ${path}`),
  );
});

test("rewrites nested dashboard API endpoints to the flat proxy function", async (t) => {
  const proxied = [];
  const upstream = http.createServer((incoming, response) => {
    proxied.push(`${incoming.method} ${incoming.url}`);
    response.writeHead(200);
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const nestedRequests = [
    ["GET", "/api/dashboard/auth/me", "/dashboard/auth/me"],
    ["GET", "/api/dashboard/orders", "/orders"],
    ["POST", "/api/dashboard/orders", "/orders"],
    ["GET", "/api/dashboard/watchlist", "/watchlist"],
    ["POST", "/api/dashboard/watchlist", "/watchlist"],
    ["DELETE", "/api/dashboard/watchlist/INFY", "/watchlist/INFY"],
    ["GET", "/api/orders", "/orders"],
    ["GET", "/api/watchlist", "/watchlist"],
    ["DELETE", "/api/watchlist/INFY", "/watchlist/INFY"],
    ["GET", "/api/market/history/INFY", "/market/history/INFY"],
  ];

  for (const [method, path] of nestedRequests) {
    const response = await request(proxyPort, {
      path,
      method,
      headers: { origin: dashboardOrigin },
    });
    assert.equal(response.statusCode, 200, path);
  }

  assert.deepEqual(
    proxied,
    nestedRequests.map(
      ([method, , backendPath]) => `${method} ${backendPath}`,
    ),
  );
});

test("normalizes rewritten and original API URLs to canonical backend paths", async (t) => {
  const proxied = [];
  const upstream = http.createServer((incoming, response) => {
    proxied.push(`${incoming.method} ${incoming.url}`);
    response.writeHead(200);
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const requests = [
    {
      method: "GET",
      path: "/api/proxy?__api_path=dashboard/auth/me",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/proxy?__api_path=dashboard%2Fauth%2Fme",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/dashboard/auth/me",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/dashboard/auth/me?__api_path=dashboard%2Fauth%2Fme&view=full",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/proxy?__api_path=market/history/INFY&range=week",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/market/history/INFY?range=week",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/proxy?__api_path=dashboard/watchlist",
      rewrite: false,
    },
    {
      method: "GET",
      path: "/api/dashboard/watchlist",
      rewrite: false,
    },
  ];

  for (const testRequest of requests) {
    const response = await request(proxyPort, {
      ...testRequest,
      headers: { origin: dashboardOrigin },
    });
    assert.equal(response.statusCode, 200, testRequest.path);
  }

  assert.deepEqual(proxied, [
    "GET /dashboard/auth/me",
    "GET /dashboard/auth/me",
    "GET /dashboard/auth/me",
    "GET /dashboard/auth/me?view=full",
    "GET /market/history/INFY?range=week",
    "GET /market/history/INFY?range=week",
    "GET /watchlist",
    "GET /watchlist",
  ]);
});

test("rejects malformed, encoded traversal, and unsupported API paths", async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((_incoming, response) => {
    upstreamRequests += 1;
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const rejectedRequests = [
    "/api/%2e%2e/dashboard/auth/me",
    "/api/dashboard/watchlist/%2e%2e",
    "/api/dashboard/watchlist/%252e%252e",
    "/api/dashboard/watchlist/%2f..",
    "/api/dashboard/watchlist/%E0%A4%A",
    "/api/dashboard%2Fauth%2Fme",
    "/api/dashboard/auth/me?__api_path=dashboard/auth/logout",
    "/api/dashboard/auth/me?__api_path=dashboard/auth/me&__api_path=dashboard/auth/me",
    "/api/dashboard/auth/me?__api_path=dashboard%2Fauth%2Fme&__api_path=dashboard%2Fauth%2Fme",
    "/api/dashboard/auth/me?__api_path=dashboard%2Fauth%2F%ZZ",
    "/api/proxy?__api_path=dashboard%2F..%2Fauth%2Fme",
    "/api/proxy?__api_path=dashboard/%252e%252e/auth/me",
    "/api/proxy?__api_path=dashboard%2Fauth%2F%ZZ",
    "/api/unknown/nested/endpoint",
  ];

  for (const path of rejectedRequests) {
    const response = await request(proxyPort, {
      path,
      rewrite: false,
      headers: { origin: dashboardOrigin },
    });
    assert.ok(response.statusCode >= 400, `${path} should be rejected`);
  }

  assert.equal(upstreamRequests, 0);
});

test("rejects invalid origins, unsupported endpoints, and methods before proxying", async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((_incoming, response) => {
    upstreamRequests += 1;
    response.end("unexpected");
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const invalidOrigin = await request(proxyPort, {
    path: "/api/dashboard/auth/me",
    headers: { origin: "https://attacker.example" },
  });
  const mainLogout = await request(proxyPort, {
    path: "/api/auth/logout",
    method: "POST",
    headers: { origin: dashboardOrigin },
  });
  const invalidMethod = await request(proxyPort, {
    path: "/api/portfolio",
    method: "POST",
    headers: { origin: dashboardOrigin },
  });

  assert.equal(invalidOrigin.statusCode, 403);
  assert.equal(mainLogout.statusCode, 404);
  assert.equal(invalidMethod.statusCode, 405);
  assert.equal(upstreamRequests, 0);
});

test("allows same-origin GET with Origin or without Origin", async (t) => {
  const upstreamRequests = [];
  const upstream = http.createServer((incoming, response) => {
    upstreamRequests.push(incoming.url);
    response.writeHead(200);
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const withOrigin = await request(proxyPort, {
    path: "/api/dashboard/auth/me",
    headers: { origin: dashboardOrigin },
  });
  const withoutOrigin = await request(proxyPort, {
    path: "/api/watchlist",
  });

  assert.equal(withOrigin.statusCode, 200);
  assert.equal(withoutOrigin.statusCode, 200);
  assert.deepEqual(upstreamRequests, ["/dashboard/auth/me", "/watchlist"]);
});

test("rejects GET requests with an invalid Origin, Referer, or Host", async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((_incoming, response) => {
    upstreamRequests += 1;
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const invalidOrigin = await request(proxyPort, {
    path: "/api/orders",
    headers: { origin: "https://attacker.example" },
  });
  const invalidReferer = await request(proxyPort, {
    path: "/api/funds",
    headers: { referer: "https://attacker.example/path" },
  });
  const invalidHost = await request(proxyPort, {
    path: "/api/portfolio",
    host: "attacker.example",
  });

  assert.equal(invalidOrigin.statusCode, 403);
  assert.equal(invalidReferer.statusCode, 403);
  assert.equal(invalidHost.statusCode, 403);
  assert.equal(upstreamRequests, 0);
});

test("requires an exact Origin on state-changing requests", async (t) => {
  const upstreamRequests = [];
  const upstream = http.createServer((incoming, response) => {
    upstreamRequests.push(incoming.method);
    response.writeHead(204);
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: dashboardOrigin,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const missingOrigin = await request(proxyPort, {
    path: "/api/watchlist",
    method: "POST",
  });
  const invalidOrigin = await request(proxyPort, {
    path: "/api/watchlist",
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });
  const validOrigin = await request(proxyPort, {
    path: "/api/watchlist",
    method: "POST",
    headers: { origin: dashboardOrigin },
  });

  assert.equal(missingOrigin.statusCode, 403);
  assert.equal(invalidOrigin.statusCode, 403);
  assert.equal(validOrigin.statusCode, 204);
  assert.deepEqual(upstreamRequests, ["POST"]);
});

test("production accepts only canonical origin; Preview accepts only its VERCEL_URL origin", async (t) => {
  const productionEnvironment = {
    VERCEL_ENV: "production",
    VERCEL_URL: "unexpected-preview.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "equityflow-dashboard.vercel.app",
  };
  const previewEnvironment = {
    VERCEL_ENV: "preview",
    VERCEL_URL: new URL(previewOrigin).host,
    VERCEL_PROJECT_PRODUCTION_URL: "equityflow-dashboard.vercel.app",
    VERCEL_BRANCH_URL: "unexpected-branch.vercel.app",
  };

  assert.equal(getDeploymentOrigin(productionEnvironment), dashboardOrigin);
  assert.equal(getDeploymentOrigin(previewEnvironment), previewOrigin);

  const upstream = http.createServer((_incoming, response) => {
    response.writeHead(200);
    response.end();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const productionServer = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: getDeploymentOrigin(productionEnvironment),
    }),
  );
  const productionPort = await listen(productionServer);
  t.after(() => close(productionServer));

  const previewServer = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: getDeploymentOrigin(previewEnvironment),
    }),
  );
  const previewPort = await listen(previewServer);
  t.after(() => close(previewServer));

  const productionCanonical = await request(productionPort, {
    path: "/api/funds",
    host: new URL(dashboardOrigin).host,
    headers: { origin: dashboardOrigin },
  });
  const productionRejectsPreview = await request(productionPort, {
    path: "/api/funds",
    host: new URL(dashboardOrigin).host,
    headers: { origin: previewOrigin },
  });
  const previewRejectsProduction = await request(previewPort, {
    path: "/api/funds",
    host: new URL(previewOrigin).host,
    headers: { origin: dashboardOrigin },
  });
  const previewAcceptsOwnOrigin = await request(previewPort, {
    path: "/api/funds",
    host: new URL(previewOrigin).host,
    headers: { origin: previewOrigin },
  });

  assert.equal(productionCanonical.statusCode, 200);
  assert.equal(productionRejectsPreview.statusCode, 403);
  assert.equal(previewRejectsProduction.statusCode, 403);
  assert.equal(previewAcceptsOwnOrigin.statusCode, 200);
});

test("Preview production API access requires the explicit string true", () => {
  assert.equal(
    getConfiguredUpstream({ VERCEL_ENV: "production" }),
    "https://equityflow-fhkv.onrender.com",
  );
  assert.equal(
    getConfiguredUpstream({ VERCEL_ENV: "preview" }),
    null,
  );
  assert.throws(
    () =>
      getConfiguredUpstream({
        VERCEL_ENV: "preview",
        TRADEHUB_API_ORIGIN: "https://equityflow-fhkv.onrender.com",
      }),
    /explicit opt-in/,
  );
  assert.throws(
    () =>
      getConfiguredUpstream({
        VERCEL_ENV: "preview",
        TRADEHUB_API_ORIGIN: "https://equityflow-fhkv.onrender.com",
        ALLOW_PRODUCTION_PREVIEW_API: "false",
      }),
    /explicit opt-in/,
  );
  assert.throws(
    () =>
      getConfiguredUpstream({
        VERCEL_ENV: "preview",
        TRADEHUB_API_ORIGIN: "https://equityflow-fhkv.onrender.com",
        ALLOW_PRODUCTION_PREVIEW_API: "TRUE",
      }),
    /explicit opt-in/,
  );
  assert.equal(
    getConfiguredUpstream({
      VERCEL_ENV: "preview",
      TRADEHUB_API_ORIGIN: "https://equityflow-fhkv.onrender.com",
      ALLOW_PRODUCTION_PREVIEW_API: "true",
    }),
    "https://equityflow-fhkv.onrender.com",
  );
  assert.equal(
    getConfiguredUpstream({
      VERCEL_ENV: "preview",
      TRADEHUB_API_ORIGIN: "https://tradehub-staging.example.test",
    }),
    "https://tradehub-staging.example.test",
  );
  assert.equal(
    getConfiguredUpstream({
      VERCEL_ENV: "production",
      ALLOW_PRODUCTION_PREVIEW_API: "false",
    }),
    "https://equityflow-fhkv.onrender.com",
  );
});

test("Preview production-backend mode allows auth and reads but blocks every mutation", async (t) => {
  const received = [];
  const upstream = http.createServer((incoming, response) => {
    received.push(`${incoming.method} ${incoming.url}`);
    response.writeHead(200, {
      "content-type": "application/json",
    });
    response.end(JSON.stringify({ ok: true }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => close(upstream));

  const server = http.createServer(
    createDashboardProxy({
      upstreamOrigin: `http://127.0.0.1:${upstreamPort}`,
      deploymentOrigin: previewOrigin,
      readOnlyPreview: true,
    }),
  );
  const proxyPort = await listen(server);
  t.after(() => close(server));

  const allowedRequests = [
    ["POST", "/api/dashboard/auth/login", 200],
    ["POST", "/api/dashboard/auth/logout", 200],
    ["GET", "/api/dashboard/auth/me", 200],
    ["HEAD", "/api/dashboard/orders", 200],
    ["GET", "/api/dashboard/orders", 200],
    ["GET", "/api/dashboard/watchlist", 200],
    ["GET", "/api/watchlist", 200],
    ["GET", "/api/portfolio", 200],
    ["GET", "/api/funds", 200],
    ["GET", "/api/allHoldings", 200],
    ["GET", "/api/allPositions", 200],
  ];

  for (const [method, path, statusCode] of allowedRequests) {
    const response = await request(proxyPort, {
      path,
      method,
      host: new URL(previewOrigin).host,
      headers: { origin: previewOrigin },
    });
    assert.equal(response.statusCode, statusCode, `${method} ${path}`);
  }

  const blockedRequests = [
    ["POST", "/api/orders"],
    ["POST", "/api/dashboard/orders"],
    ["POST", "/api/watchlist"],
    ["POST", "/api/dashboard/watchlist"],
    ["DELETE", "/api/watchlist/INFY"],
    ["DELETE", "/api/dashboard/watchlist/INFY"],
    ["PUT", "/api/orders"],
    ["PATCH", "/api/portfolio"],
  ];

  for (const [method, path] of blockedRequests) {
    const response = await request(proxyPort, {
      path,
      method,
      host: new URL(previewOrigin).host,
      headers: { origin: previewOrigin },
    });
    assert.equal(response.statusCode, 405, `${method} ${path}`);
  }

  const cancellation = await request(proxyPort, {
    path: "/api/orders/123/cancel",
    method: "POST",
    host: new URL(previewOrigin).host,
    headers: { origin: previewOrigin },
  });
  assert.equal(cancellation.statusCode, 404);
  assert.deepEqual(received, [
    "POST /dashboard/auth/login",
    "POST /dashboard/auth/logout",
    "GET /dashboard/auth/me",
    "HEAD /orders",
    "GET /orders",
    "GET /watchlist",
    "GET /watchlist",
    "GET /portfolio",
    "GET /funds",
    "GET /allHoldings",
    "GET /allPositions",
  ]);
});

test("rejects non-origin and non-HTTPS production upstream configuration", () => {
  assert.throws(
    () =>
      createDashboardProxy({
        upstreamOrigin: "https://api.example.test/path",
        deploymentOrigin: dashboardOrigin,
      }),
    /must be an origin URL/,
  );
});
