const assert = require("node:assert/strict");
const { test } = require("node:test");

const { logMarketDataUnavailable } = require("./marketDataLogging");

test("throttles repeated quota errors per symbol and UTC session", () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  const error = Object.assign(
    new Error("The daily Alpha Vantage request budget has been reached."),
    { code: "MARKET_DATA_RATE_LIMITED", statusCode: 429 },
  );

  assert.equal(
    logMarketDataUnavailable("HUL", error, {
      logger,
      now: new Date("2026-10-10T10:00:00.000Z"),
    }),
    true,
  );
  assert.equal(
    logMarketDataUnavailable("HUL", error, {
      logger,
      now: new Date("2026-10-10T11:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    logMarketDataUnavailable("TCS", error, {
      logger,
      now: new Date("2026-10-10T11:00:00.000Z"),
    }),
    true,
  );
  assert.equal(
    logMarketDataUnavailable("HUL", error, {
      logger,
      now: new Date("2026-10-11T00:00:00.000Z"),
    }),
    true,
  );
  assert.equal(warnings.length, 3);
});

test("does not suppress a materially different market-data failure", () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  const quotaError = Object.assign(new Error("Quota reached"), {
    code: "MARKET_DATA_RATE_LIMITED",
    statusCode: 429,
  });
  const providerError = Object.assign(new Error("Provider timed out"), {
    code: "MARKET_DATA_PROVIDER_UNAVAILABLE",
    statusCode: 504,
  });
  const now = new Date("2026-10-10T10:00:00.000Z");

  logMarketDataUnavailable("HUL", quotaError, { logger, now });
  assert.equal(
    logMarketDataUnavailable("HUL", quotaError, { logger, now }),
    false,
  );
  assert.equal(
    logMarketDataUnavailable("HUL", providerError, { logger, now }),
    true,
  );
  assert.deepEqual(warnings, [
    "Market data unavailable for HUL: Quota reached",
    "Market data unavailable for HUL: Provider timed out",
  ]);
});

test("throttles identical non-quota errors but logs a changed failure", () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  const now = new Date("2026-10-10T10:00:00.000Z");
  const unavailable = Object.assign(
    new Error("No completed-session close is cached."),
    { code: "MARKET_DATA_UNAVAILABLE", statusCode: 503 },
  );
  const changed = Object.assign(
    new Error("The provider returned malformed daily prices."),
    { code: "MALFORMED_MARKET_DATA", statusCode: 502 },
  );

  assert.equal(
    logMarketDataUnavailable("HUL", unavailable, { logger, now }),
    true,
  );
  assert.equal(
    logMarketDataUnavailable("HUL", unavailable, { logger, now }),
    false,
  );
  assert.equal(
    logMarketDataUnavailable("HUL", changed, { logger, now }),
    true,
  );
  assert.equal(warnings.length, 2);
});
