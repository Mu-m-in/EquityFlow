const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const jwt = require("jsonwebtoken");

const { requireAuth } = require("./auth");
const {
  createRequireAppOrDashboardAuth,
} = require("./appOrDashboardAuth");
const {
  clearDashboardSessionCookie,
  requireDashboardAuth,
} = require("./dashboardAuth");

const previousSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "app-or-dashboard-auth-test-secret";

const dashboardOrigin = "https://dashboard.example.test";
const mainOrigin = "https://app.example.test";
const appOrDashboardAuth = createRequireAppOrDashboardAuth({
  frontendOrigin: mainOrigin,
  dashboardOrigin,
});

const tokenFor = (claims, options) =>
  jwt.sign(
    { userId: "user-1", email: "user@example.test", ...claims },
    process.env.JWT_SECRET,
    options,
  );

const authenticate = (middleware, { cookie, origin } = {}) => {
  const req = {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(origin !== undefined ? { origin } : {}),
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  return { nextCalled, req, res };
};

test("shared data auth accepts a main-site token from the main-site cookie", () => {
  const token = tokenFor({});
  const result = authenticate(appOrDashboardAuth, {
    cookie: `equityflow_session=${token}`,
    origin: mainOrigin,
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.userId, "user-1");
});

test("shared data auth rejects missing Origin", () => {
  const result = authenticate(appOrDashboardAuth, {
    cookie: `equityflow_session=${tokenFor({})}`,
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 403);
  assert.deepEqual(result.res.payload, { message: "Origin not allowed" });
});

test("shared data auth rejects null and unknown Origins", () => {
  for (const origin of [null, "https://unknown.example.test"]) {
    const result = authenticate(appOrDashboardAuth, {
      cookie: `equityflow_session=${tokenFor({})}`,
      origin,
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
    assert.deepEqual(result.res.payload, { message: "Origin not allowed" });
  }
});

test("shared data auth accepts a dashboard token from the dashboard cookie", () => {
  const token = tokenFor({ tokenType: "dashboard" });
  const result = authenticate(appOrDashboardAuth, {
    cookie: `tradehub_dashboard_session=${token}`,
    origin: dashboardOrigin,
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.userId, "user-1");
  assert.equal(result.req.user.tokenType, "dashboard");
});

test("dashboard origin uses only its own cookie when both sessions exist", () => {
  const mainToken = tokenFor({ userId: "main-user" });
  const dashboardToken = tokenFor({
    userId: "dashboard-user",
    tokenType: "dashboard",
  });
  const result = authenticate(appOrDashboardAuth, {
    cookie: `equityflow_session=${mainToken}; tradehub_dashboard_session=${dashboardToken}`,
    origin: dashboardOrigin,
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.userId, "dashboard-user");
});

test("dashboard-only middleware rejects a main-site token", () => {
  const token = tokenFor({});
  const result = authenticate(requireDashboardAuth, {
    cookie: `tradehub_dashboard_session=${token}`,
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});

test("original requireAuth rejects a dashboard session cookie", () => {
  const token = tokenFor({ tokenType: "dashboard" });
  const result = authenticate(requireAuth, {
    cookie: `tradehub_dashboard_session=${token}`,
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});

test("shared auth rejects a main token presented to the dashboard origin", () => {
  const token = tokenFor({});
  const result = authenticate(appOrDashboardAuth, {
    cookie: `equityflow_session=${token}`,
    origin: dashboardOrigin,
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});

test("shared auth rejects a dashboard token presented as the main-site token", () => {
  const token = tokenFor({ tokenType: "dashboard" });
  const result = authenticate(appOrDashboardAuth, {
    cookie: `equityflow_session=${token}`,
    origin: mainOrigin,
  });

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});

test("shared auth rejects missing, malformed, invalid, and expired tokens", () => {
  const expiredToken = tokenFor({}, { expiresIn: -1 });
  const invalidToken = `${tokenFor({})}tampered`;
  const cases = [
    { cookie: undefined },
    { cookie: "equityflow_session=%ZZ" },
    { cookie: "equityflow_session=not-a-jwt" },
    { cookie: `equityflow_session=${invalidToken}` },
    { cookie: `equityflow_session=${expiredToken}` },
  ];

  for (const { cookie } of cases) {
    const result = authenticate(appOrDashboardAuth, {
      cookie,
      origin: mainOrigin,
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 401);
  }

  const expiredDashboardToken = tokenFor(
    { tokenType: "dashboard" },
    { expiresIn: -1 },
  );
  const expiredDashboardResult = authenticate(appOrDashboardAuth, {
    cookie: `tradehub_dashboard_session=${expiredDashboardToken}`,
    origin: dashboardOrigin,
  });
  assert.equal(expiredDashboardResult.nextCalled, false);
  assert.equal(expiredDashboardResult.res.statusCode, 401);
});

test("dashboard logout clears only the dashboard cookie", () => {
  let clearedCookie;
  let options;
  clearDashboardSessionCookie(
    {
      clearCookie(name, cookieOptions) {
        clearedCookie = name;
        options = cookieOptions;
      },
    },
    { path: "/", httpOnly: true },
  );

  assert.equal(clearedCookie, "tradehub_dashboard_session");
  assert.deepEqual(options, { path: "/", httpOnly: true });
});

after(() => {
  if (previousSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousSecret;
  }
});
