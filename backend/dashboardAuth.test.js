const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET ||= "this-is-a-test-secret-with-at-least-32-chars";

const {
  createDashboardToken,
  requireDashboardAuth,
  verifyDashboardToken,
} = require("./middleware/dashboardAuth");

test("dashboard tokens include the dashboard token type claim", () => {
  const token = createDashboardToken({ _id: "user-123", email: "test@example.com" });
  const payload = jwt.decode(token);

  assert.equal(payload.userId, "user-123");
  assert.equal(payload.email, "test@example.com");
  assert.equal(payload.tokenType, "dashboard");
});

test("dashboard auth rejects ordinary equityflow tokens", () => {
  const token = jwt.sign(
    {
      userId: "user-123",
      email: "test@example.com",
      tokenType: "equityflow",
    },
    process.env.JWT_SECRET,
  );

  assert.throws(() => verifyDashboardToken(token), /Dashboard token type is invalid/);

  const req = {
    headers: {
      cookie: `tradehub_dashboard_session=${token}`,
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
  const next = () => {
    nextCalled = true;
  };

  requireDashboardAuth(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { message: "Invalid or expired token" });
  assert.equal(nextCalled, false);
});
