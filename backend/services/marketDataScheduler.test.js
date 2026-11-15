const assert = require("node:assert/strict");
const { beforeEach, test } = require("node:test");

const {
  createMarketDataScheduler,
  getNextScheduledAt,
} = require("./marketDataScheduler");

const SCHEDULE_STATE_ID = "market-close-refresh";
const asQuery = (value) => ({ lean: async () => value });
let now;
let stateRecords;
let historyCalls;
let requestBlock;
let stockSymbols;
let watchlistSymbols;
let groups;
let failures;
let scheduledTimers;
let intervalCount;
let logs;

const stateModel = {
  findOne: ({ _id }) => asQuery(stateRecords.get(_id) || null),
  updateOne: async (filter, update) => {
    let record = stateRecords.get(filter._id);
    if (!record && update.$setOnInsert) {
      record = { _id: filter._id, ...update.$setOnInsert };
      stateRecords.set(filter._id, record);
    }
    if (!record) {
      return { matchedCount: 0 };
    }
    if (
      filter.leaseOwner !== undefined &&
      record.leaseOwner !== filter.leaseOwner
    ) {
      return { matchedCount: 0 };
    }
    if (
      filter.leaseUntil?.$gt &&
      !(record.leaseUntil > filter.leaseUntil.$gt)
    ) {
      return { matchedCount: 0 };
    }
    Object.assign(record, update.$set || {});
    for (const key of Object.keys(update.$unset || {})) {
      delete record[key];
    }
    return { matchedCount: 1 };
  },
  findOneAndUpdate: (filter, update) => {
    const record = stateRecords.get(filter._id);
    if (
      !record ||
      !(record.leaseUntil <= filter.leaseUntil.$lte) ||
      record.lastCompletedRunDate === filter.lastCompletedRunDate.$ne
    ) {
      return asQuery(null);
    }
    Object.assign(record, update.$set);
    return asQuery({ ...record });
  },
};

const makeModel = (symbols) => ({
  find: () => asQuery(symbols.map((symbol) => ({ symbol }))),
});

const makeScheduler = (options = {}) =>
  createMarketDataScheduler({
    stateModel,
    stockModel: makeModel(stockSymbols),
    watchlistModel: makeModel(watchlistSymbols),
    loadHistory: async (symbol) => {
      historyCalls.push(symbol);
      if (failures.has(symbol)) {
        throw failures.get(symbol);
      }
      return { symbol, isStale: false, marketDataError: null };
    },
    getRequestGroups: async (symbols) =>
      groups || { uncached: symbols, refreshable: [], cached: [] },
    getRequestBlock: async () => requestBlock,
    getNow: () => new Date(now),
    setTimeoutFn: (callback, delay) => {
      const timer = { callback, delay, unref() {} };
      scheduledTimers.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    setIntervalFn: () => {
      intervalCount += 1;
      return { unref() {} };
    },
    clearIntervalFn: () => {},
    makeOwner: () => `owner-${Math.random()}`,
    log: {
      info: (...args) => logs.push(["info", ...args]),
      warn: (...args) => logs.push(["warn", ...args]),
      error: (...args) => logs.push(["error", ...args]),
    },
    ...options,
  });

beforeEach(() => {
  now = new Date("2026-10-12T10:30:00.000Z");
  stateRecords = new Map();
  historyCalls = [];
  requestBlock = null;
  stockSymbols = ["INFY", "TCS", "WIPRO"];
  watchlistSymbols = ["TCS", "ZENTEC.BSE"];
  groups = null;
  failures = new Map();
  scheduledTimers = [];
  intervalCount = 0;
  logs = [];
  delete process.env.INDIA_MARKET_HOLIDAYS;
});

test("schedules for 15:45 Asia/Kolkata, after market close", () => {
  const now = new Date("2026-10-12T10:14:00.000Z");
  const scheduledAt = getNextScheduledAt(now, new Set());

  assert.equal(scheduledAt.toISOString(), "2026-10-12T10:15:00.000Z");
});

test("does not execute before 15:45 IST and runs when the scheduled time is due", async () => {
  const scheduler = makeScheduler();
  now = new Date("2026-10-12T10:14:00.000Z");

  assert.deepEqual(await scheduler.runScheduledRefresh(), {
    status: "skipped",
    reason: "not-due",
  });
  assert.equal(historyCalls.length, 0);

  now = new Date("2026-10-12T10:15:00.000Z");
  const result = await scheduler.runScheduledRefresh();
  assert.equal(result.status, "completed");
  assert.equal(historyCalls.length, 4);
});

test("schedules on weekdays only and skips weekends", () => {
  const saturday = new Date("2026-10-10T12:00:00.000Z");
  const scheduledAt = getNextScheduledAt(saturday, new Set());

  assert.equal(scheduledAt.toISOString(), "2026-10-12T10:15:00.000Z");
});

test("skips configured holidays when selecting the next scheduled run", () => {
  const monday = new Date("2026-10-12T10:14:00.000Z");
  const scheduledAt = getNextScheduledAt(
    monday,
    new Set(["2026-10-12"]),
  );

  assert.equal(scheduledAt.toISOString(), "2026-10-13T10:15:00.000Z");
});

test("selects only current application and included watchlist symbols", async () => {
  const scheduler = makeScheduler({
    getRequestGroups: async (symbols) => {
      assert.deepEqual(symbols, ["INFY", "TCS", "WIPRO", "ZENTEC.BSE"]);
      return {
        uncached: ["TCS", "INFY"],
        refreshable: ["WIPRO"],
        cached: ["ZENTEC.BSE"],
      };
    },
  });

  await scheduler.runScheduledRefresh();

  assert.deepEqual(historyCalls, ["TCS", "INFY", "WIPRO"]);
  assert.ok(
    logs.some((entry) =>
      entry.join(" ").includes("Skipping ZENTEC.BSE: cached close matches"),
    ),
  );
});

test("prioritizes uncached symbols, refreshes stale symbols, and skips current data", async () => {
  groups = {
    uncached: ["HUL"],
    refreshable: ["INFY"],
    cached: ["TCS"],
  };
  stockSymbols = ["INFY", "TCS", "HUL"];
  watchlistSymbols = [];

  await makeScheduler().runScheduledRefresh();

  assert.deepEqual(historyCalls, ["HUL", "INFY"]);
});

test("stops a batch when the daily quota is exhausted", async () => {
  requestBlock = {
    code: "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
    retryAt: new Date("2026-10-13T00:00:00.000Z"),
  };

  const result = await makeScheduler().runScheduledRefresh();

  assert.deepEqual(historyCalls, []);
  assert.equal(result.status, "deferred");
  assert.equal(result.retryAt.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate, undefined);
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).leaseOwner, undefined);
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).leaseUntil.getTime(),
    0,
  );
  assert.ok(
    logs.some((entry) => entry.join(" ").includes("MARKET_DATA_DAILY_QUOTA_EXHAUSTED")),
  );
});

test("stops a batch when the persistent provider cooldown is active", async () => {
  requestBlock = {
    code: "MARKET_DATA_RATE_LIMITED",
    retryAt: new Date("2026-10-12T10:45:00.000Z"),
  };

  const result = await makeScheduler().runScheduledRefresh();

  assert.equal(historyCalls.length, 0);
  assert.equal(result.status, "deferred");
  assert.equal(result.retryAt.toISOString(), "2026-10-12T10:45:00.000Z");
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate, undefined);
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).leaseOwner, undefined);
  assert.ok(
    logs.some((entry) => entry.join(" ").includes("MARKET_DATA_RATE_LIMITED")),
  );
});

test("defers after quota or rate-limit errors thrown while processing a symbol", async () => {
  for (const code of [
    "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
    "MARKET_DATA_RATE_LIMITED",
  ]) {
    stateRecords.clear();
    historyCalls.length = 0;
    const retryAt = new Date("2026-10-13T00:00:00.000Z");
    const error = Object.assign(new Error(code), { code, retryAt });
    const result = await makeScheduler({
      loadHistory: async (symbol) => {
        historyCalls.push(symbol);
        throw error;
      },
    }).runScheduledRefresh();

    assert.deepEqual(historyCalls, ["INFY"]);
    assert.equal(result.status, "deferred");
    assert.equal(result.reason, code);
    assert.equal(result.retryAt, retryAt);
    assert.equal(stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate, undefined);
    assert.equal(stateRecords.get(SCHEDULE_STATE_ID).leaseOwner, undefined);
  }
});

test("does not process remaining symbols after a quota or rate-limit error", async () => {
  for (const code of [
    "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
    "MARKET_DATA_RATE_LIMITED",
  ]) {
    stateRecords.clear();
    historyCalls.length = 0;
    failures.set(
      "INFY",
      Object.assign(new Error(code), {
        code,
        retryAt: new Date("2026-10-13T00:00:00.000Z"),
      }),
    );
    const result = await makeScheduler().runScheduledRefresh();

    assert.deepEqual(historyCalls, ["INFY"]);
    assert.equal(result.status, "deferred");
    failures.clear();
  }
});

test("a deferred run releases its lease so the same date can be retried", async () => {
  requestBlock = {
    code: "MARKET_DATA_RATE_LIMITED",
    retryAt: new Date("2026-10-12T10:45:00.000Z"),
  };
  const scheduler = makeScheduler();

  const deferred = await scheduler.runScheduledRefresh();
  assert.equal(deferred.status, "deferred");
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).leaseOwner, undefined);
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate, undefined);

  requestBlock = null;
  const retried = await scheduler.runScheduledRefresh();

  assert.equal(retried.status, "completed");
  assert.equal(historyCalls.length, 4);
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate,
    "2026-10-12",
  );
});

test("continues processing after an individual symbol failure", async () => {
  failures.set("INFY", new Error("symbol request failed"));

  const result = await makeScheduler().runScheduledRefresh();

  assert.deepEqual(historyCalls, ["INFY", "TCS", "WIPRO", "ZENTEC.BSE"]);
  assert.equal(result.failed, 1);
  assert.equal(result.successful, 3);
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate,
    "2026-10-12",
  );
});

test("does not allow overlapping executions within one backend instance", async () => {
  let releaseRequest;
  let waitedForRequest = false;
  const scheduler = makeScheduler({
    loadHistory: async (symbol) => {
      historyCalls.push(symbol);
      if (!waitedForRequest) {
        waitedForRequest = true;
        await new Promise((resolve) => {
          releaseRequest = resolve;
        });
      }
      return { isStale: false };
    },
  });

  const firstRun = scheduler.runScheduledRefresh();
  while (!releaseRequest) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const secondRun = scheduler.runScheduledRefresh();
  releaseRequest();

  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(historyCalls.length, 4);
});

test("only one of multiple backend instances acquires an active lease", async () => {
  let releaseRequest;
  let waitedForRequest = false;
  const firstScheduler = makeScheduler({
    loadHistory: async (symbol) => {
      historyCalls.push(symbol);
      if (!waitedForRequest) {
        waitedForRequest = true;
        await new Promise((resolve) => {
          releaseRequest = resolve;
        });
      }
      return { isStale: false };
    },
  });
  const secondScheduler = makeScheduler();

  const firstRun = firstScheduler.runScheduledRefresh();
  while (!releaseRequest) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const secondResult = await secondScheduler.runScheduledRefresh();
  assert.equal(secondResult.status, "busy");

  releaseRequest();
  assert.equal((await firstRun).status, "completed");
});

test("an expired lease left by a crashed process can be acquired", async () => {
  stateRecords.set(SCHEDULE_STATE_ID, {
    _id: SCHEDULE_STATE_ID,
    leaseOwner: "crashed-process",
    leaseUntil: new Date(now.getTime() - 1),
  });

  const result = await makeScheduler().runScheduledRefresh();

  assert.equal(result.status, "completed");
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate,
    "2026-10-12",
  );
  assert.equal(stateRecords.get(SCHEDULE_STATE_ID).leaseOwner, undefined);
});

test("a stale lease owner cannot clear a newer instance's lease", async () => {
  stateRecords.set(SCHEDULE_STATE_ID, {
    _id: SCHEDULE_STATE_ID,
    leaseOwner: "new-process",
    leaseUntil: new Date(now.getTime() + 60 * 1000),
  });
  const staleRelease = await stateModel.updateOne(
    { _id: SCHEDULE_STATE_ID, leaseOwner: "old-process" },
    { $unset: { leaseOwner: 1, leaseUntil: 1 } },
  );

  assert.equal(staleRelease.matchedCount, 0);
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).leaseOwner,
    "new-process",
  );
});

test("does not repeat a completed run on the same day or after restart", async () => {
  const firstScheduler = makeScheduler();
  await firstScheduler.runScheduledRefresh();
  const firstCount = historyCalls.length;

  const restartedScheduler = makeScheduler();
  const result = await restartedScheduler.runScheduledRefresh();

  assert.equal(result.status, "completed");
  assert.equal(historyCalls.length, firstCount);
});

test("reuses the released lease for the next eligible market day", async () => {
  const scheduler = makeScheduler();
  await scheduler.runScheduledRefresh();
  historyCalls.length = 0;
  now = new Date("2026-10-13T10:30:00.000Z");

  const result = await scheduler.runScheduledRefresh();

  assert.equal(result.status, "completed");
  assert.equal(historyCalls.length, 4);
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate,
    "2026-10-13",
  );
});

test("a scheduler instance starts at most one timer", async () => {
  const scheduler = makeScheduler();

  scheduler.start();
  scheduler.start();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(scheduledTimers.length, 1);
  await scheduler.stop();
});

test("retry timers use the actual quota reset and provider cooldown timestamps", async () => {
  const testCases = [
    {
      code: "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
      retryAt: new Date("2026-10-13T00:00:00.000Z"),
      expectedDelay: 48_601_000,
    },
    {
      code: "MARKET_DATA_RATE_LIMITED",
      retryAt: new Date("2026-10-12T10:45:00.000Z"),
      expectedDelay: 901_000,
    },
  ];

  for (const testCase of testCases) {
    stateRecords.clear();
    scheduledTimers.length = 0;
    const scheduler = makeScheduler({
      getRequestBlock: async () => testCase,
    });
    scheduler.start();
    while (scheduledTimers.length < 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    scheduledTimers[0].callback();
    while (scheduledTimers.length < 2) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    assert.equal(scheduledTimers[1].delay, testCase.expectedDelay);
    assert.equal(stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate, undefined);
    await scheduler.stop();
  }
});

test("retries at daily quota reset even before the next 15:45 schedule", async () => {
  const retryAt = new Date("2026-10-13T00:00:00.000Z");
  requestBlock = {
    code: "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
    retryAt,
  };
  const scheduler = makeScheduler();
  scheduler.start();
  while (scheduledTimers.length < 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  scheduledTimers[0].callback();
  while (scheduledTimers.length < 2) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  now = new Date(retryAt.getTime() + 1000);
  requestBlock = null;
  scheduledTimers[1].callback();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (
      stateRecords.get(SCHEDULE_STATE_ID)?.lastCompletedRunDate ===
      "2026-10-13"
    ) {
      break;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.deepEqual(historyCalls, ["INFY", "TCS", "WIPRO", "ZENTEC.BSE"]);
  assert.equal(
    stateRecords.get(SCHEDULE_STATE_ID).lastCompletedRunDate,
    "2026-10-13",
  );
  await scheduler.stop();
});

test("does not trigger scheduled work on configured holidays or weekends", async () => {
  process.env.INDIA_MARKET_HOLIDAYS = "2026-10-12";
  const holidayScheduler = makeScheduler();
  assert.deepEqual(await holidayScheduler.runScheduledRefresh(), {
    status: "skipped",
    reason: "holiday",
  });
  assert.equal(historyCalls.length, 0);

  now = new Date("2026-10-10T12:00:00.000Z");
  const weekendScheduler = makeScheduler();
  assert.deepEqual(await weekendScheduler.runScheduledRefresh(), {
    status: "skipped",
    reason: "weekend",
  });
  assert.equal(historyCalls.length, 0);
});
