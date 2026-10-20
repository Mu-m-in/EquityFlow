const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const express = require("express");
const jwt = require("jsonwebtoken");

const { requireAuth } = require("../middleware/auth");
const { createWatchlistRouter } = require("./watchlist");

const records = new Map();
let updates = [];
let server;
const previousSecret = process.env.JWT_SECRET;

const recordKey = (userId, symbol) => `${userId}:${symbol}`;

const startServer = async () => {
  const app = express();
  const UserWatchlistEntryModel = {
    findOneAndUpdate: async (filter, update, options) => {
      updates.push({ filter, update, options });
      const key = recordKey(filter.userId, filter.symbol);
      const record = records.get(key) || {
        userId: filter.userId,
        symbol: filter.symbol,
        included: true,
      };
      Object.assign(record, update.$set);
      records.set(key, record);
      return record;
    },
  };

  app.use(
    createWatchlistRouter({
      requireAuth,
      getWatchlistSymbol: async (symbol) => symbol.toUpperCase(),
      UserWatchlistEntryModel,
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};

const tokenFor = (userId) =>
  jwt.sign({ userId, email: `${userId}@example.test` }, process.env.JWT_SECRET);

const removeRequest = (baseUrl, symbol, userId) =>
  fetch(`${baseUrl}/watchlist/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
    headers: userId
      ? { Cookie: `equityflow_session=${tokenFor(userId)}` }
      : {},
  });

const resetTestState = () => {
  records.clear();
  updates = [];
  process.env.JWT_SECRET = "watchlist-test-secret";
};

test.beforeEach(resetTestState);

test.afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
});

test("removes a symbol for the authenticated user only", async () => {
  records.set(recordKey("user-a", "QUICKHEAL"), {
    userId: "user-a",
    symbol: "QUICKHEAL",
    included: true,
  });
  records.set(recordKey("user-b", "QUICKHEAL"), {
    userId: "user-b",
    symbol: "QUICKHEAL",
    included: true,
  });
  const baseUrl = await startServer();

  const response = await removeRequest(baseUrl, "QUICKHEAL", "user-a");

  assert.equal(response.status, 204);
  assert.equal(records.get(recordKey("user-a", "QUICKHEAL")).included, false);
  assert.equal(records.get(recordKey("user-b", "QUICKHEAL")).included, true);
  assert.deepEqual(updates[0].filter, {
    userId: "user-a",
    symbol: "QUICKHEAL",
  });
  assert.deepEqual(updates[0].options, {
    upsert: true,
    returnDocument: "after",
    setDefaultsOnInsert: true,
  });
});

test("removing an already-removed symbol is idempotent", async () => {
  records.set(recordKey("user-a", "QUICKHEAL"), {
    userId: "user-a",
    symbol: "QUICKHEAL",
    included: false,
  });
  const baseUrl = await startServer();

  const response = await removeRequest(baseUrl, "QUICKHEAL", "user-a");

  assert.equal(response.status, 204);
  assert.equal(records.get(recordKey("user-a", "QUICKHEAL")).included, false);
  assert.equal(updates.length, 1);
});

test("creates a user-scoped removal preference when no entry exists", async () => {
  const baseUrl = await startServer();

  const response = await removeRequest(baseUrl, "QUICKHEAL", "user-a");

  assert.equal(response.status, 204);
  assert.equal(records.get(recordKey("user-a", "QUICKHEAL")).included, false);
});

test("rejects unauthenticated removal without changing preferences", async () => {
  const baseUrl = await startServer();

  const response = await removeRequest(baseUrl, "QUICKHEAL");
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.message, "Authentication required");
  assert.equal(updates.length, 0);
  assert.equal(records.size, 0);
});

test("ignores attempts to specify another user's watchlist in the URL", async () => {
  records.set(recordKey("user-b", "QUICKHEAL"), {
    userId: "user-b",
    symbol: "QUICKHEAL",
    included: true,
  });
  const baseUrl = await startServer();

  const response = await fetch(
    `${baseUrl}/watchlist/QUICKHEAL?userId=user-b`,
    {
      method: "DELETE",
      headers: { Cookie: `equityflow_session=${tokenFor("user-a")}` },
    },
  );

  assert.equal(response.status, 204);
  assert.equal(records.get(recordKey("user-b", "QUICKHEAL")).included, true);
  assert.equal(records.get(recordKey("user-a", "QUICKHEAL")).included, false);
  assert.deepEqual(updates[0].filter, {
    userId: "user-a",
    symbol: "QUICKHEAL",
  });
});

test.after(() => {
  if (previousSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousSecret;
  }
});
