const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createRequireDashboardOrigin,
  createRequireFrontendOrigin,
} = require("./dashboardOrigin");

const dashboardOrigin = "http://localhost:5174";
const frontendOrigin = "http://localhost:5173";

const runMiddleware = (origin) => {
  const req = { headers: {} };

  if (origin !== undefined) {
    req.headers.origin = origin;
  }

  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  let nextCalled = false;

  const middleware = createRequireDashboardOrigin(dashboardOrigin);
  middleware(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
};

const runFrontendMiddleware = (origin) => {
  const req = { headers: {} };

  if (origin !== undefined) {
    req.headers.origin = origin;
  }

  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  let nextCalled = false;

  const middleware = createRequireFrontendOrigin(frontendOrigin);
  middleware(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
};

test("allows the exact dashboard Origin", () => {
  const { res, nextCalled } = runMiddleware(dashboardOrigin);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("rejects a missing Origin", () => {
  const { res, nextCalled } = runMiddleware(undefined);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Origin not allowed" });
});

test("rejects the frontend Origin", () => {
  const { res, nextCalled } = runMiddleware(frontendOrigin);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("rejects an unknown Origin", () => {
  const { res, nextCalled } = runMiddleware("https://unknown.example.com");

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("allows the exact frontend Origin for registration", () => {
  const { res, nextCalled } = runFrontendMiddleware(frontendOrigin);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("rejects a missing Origin for registration", () => {
  const { res, nextCalled } = runFrontendMiddleware(undefined);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Origin not allowed" });
});

test("rejects the dashboard Origin for registration", () => {
  const { res, nextCalled } = runFrontendMiddleware(dashboardOrigin);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});