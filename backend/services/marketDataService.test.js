const assert = require("node:assert/strict");
const { beforeEach, test } = require("node:test");

const { AlphaVantageQuotaModel } = require("../model/AlphaVantageQuotaModel");
const { MarketDataCacheModel } = require("../model/MarketDataCacheModel");
const { MarketSymbolMappingModel } = require("../model/MarketSymbolMappingModel");
const { summarizePortfolio } = require("./portfolioSummary");

const marketRecords = new Map();
const symbolMappings = new Map();
const quotaRecords = new Map();
let fetchCallCount = 0;
const updateOptions = {
  cache: [],
  mapping: [],
  quota: [],
};
const originalFetch = global.fetch;

const asQuery = (value) => ({
  lean: async () => value,
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
});

const getQuotaDay = () => new Date().toISOString().slice(0, 10);
const getQuotaCount = (day = getQuotaDay()) =>
  quotaRecords.get(day)?.count || 0;
const getQuotaCooldownUntil = (day = getQuotaDay()) =>
  quotaRecords.get(day)?.cooldownUntil || null;
const setQuotaCount = (count, day = getQuotaDay()) => {
  quotaRecords.set(day, {
    ...quotaRecords.get(day),
    count,
  });
};

const matchMapping = (mapping, filter) => {
  if (!mapping) {
    return false;
  }
  if (filter.$or) {
    return filter.$or.some(
      (condition) =>
        mapping.symbol === condition.symbol ||
        mapping.providerSymbol === condition.providerSymbol,
    );
  }
  return mapping.symbol === filter.symbol;
};

MarketDataCacheModel.findOne = ({ symbol }) =>
  asQuery(marketRecords.get(symbol) || null);
MarketDataCacheModel.find = ({ symbol }) =>
  asQuery(
    [...marketRecords.values()].filter((record) =>
      symbol.$in.includes(record.symbol),
    ),
  );
MarketDataCacheModel.findOneAndUpdate = ({ symbol }, update, options) => {
  updateOptions.cache.push(options);
  const record = {
    ...marketRecords.get(symbol),
    ...update.$set,
  };
  marketRecords.set(symbol, record);
  return asQuery(record);
};
MarketDataCacheModel.updateOne = async ({ symbol }, update) => {
  const record = marketRecords.get(symbol);
  if (record) {
    Object.assign(record, update.$set);
  }
  return { acknowledged: true };
};

MarketSymbolMappingModel.findOne = (filter) =>
  asQuery([...symbolMappings.values()].find((mapping) => matchMapping(mapping, filter)) || null);
MarketSymbolMappingModel.findOneAndUpdate = (filter, update, options) => {
  updateOptions.mapping.push(options);
  let mapping = [...symbolMappings.values()].find((entry) =>
    matchMapping(entry, filter),
  );
  if (!mapping) {
    mapping = { ...update.$setOnInsert };
    symbolMappings.set(mapping.symbol, mapping);
  }
  return asQuery(mapping);
};
MarketSymbolMappingModel.find = ({ searchQueries }) =>
  asQuery(
    [...symbolMappings.values()].filter((mapping) =>
      mapping.searchQueries?.includes(searchQueries),
    ),
  );
MarketSymbolMappingModel.updateOne = async (filter, update) => {
  let mapping = symbolMappings.get(filter.symbol);
  if (!mapping && update.$setOnInsert) {
    mapping = { ...update.$setOnInsert };
  }
  if (!mapping) {
    mapping = { symbol: filter.symbol };
  }
  Object.assign(mapping, update.$set || {});
  for (const query of update.$addToSet?.searchQueries
    ? [update.$addToSet.searchQueries]
    : []) {
    mapping.searchQueries ||= [];
    if (!mapping.searchQueries.includes(query)) {
      mapping.searchQueries.push(query);
    }
  }
  symbolMappings.set(mapping.symbol, mapping);
  return { acknowledged: true };
};

AlphaVantageQuotaModel.findOne = ({ _id }) =>
  asQuery(quotaRecords.has(_id) ? { _id, ...quotaRecords.get(_id) } : null);
AlphaVantageQuotaModel.updateOne = async ({ _id }, update) => {
  const record = quotaRecords.get(_id) || { count: 0 };
  if (update.$max?.cooldownUntil) {
    record.cooldownUntil = new Date(
      Math.max(
        record.cooldownUntil?.getTime() || 0,
        update.$max.cooldownUntil.getTime(),
      ),
    );
  }
  quotaRecords.set(_id, record);
  return { acknowledged: true };
};
AlphaVantageQuotaModel.findOneAndUpdate = async (filter, update, options) => {
  updateOptions.quota.push(options);
  const record = quotaRecords.get(filter._id) || { count: 0 };
  if (record.count >= filter.count.$lt) {
    return null;
  }
  record.count += update.$inc.count;
  quotaRecords.set(filter._id, record);
  return { count: record.count };
};

const makeDailyResponse = (extra = {}) => ({
  ok: true,
  json: async () => ({
    "Time Series (Daily)": {
      "2026-10-09": {
        "1. open": "100",
        "2. high": "110",
        "3. low": "95",
        "4. close": "105",
        "5. volume": "1000",
      },
      "2026-10-08": {
        "1. open": "90",
        "2. high": "105",
        "3. low": "89",
        "4. close": "100",
        "5. volume": "1200",
      },
    },
    ...extra,
  }),
});

const loadService = () => {
  const servicePath = require.resolve("./marketDataService");
  delete require.cache[servicePath];
  return require("./marketDataService");
};

beforeEach((t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-10-09T12:30:00.000Z"),
  });
  marketRecords.clear();
  symbolMappings.clear();
  quotaRecords.clear();
  fetchCallCount = 0;
  updateOptions.cache.length = 0;
  updateOptions.mapping.length = 0;
  updateOptions.quota.length = 0;
  process.env.ALPHA_VANTAGE_API_KEY = "test-key";
  delete process.env.INDIA_MARKET_HOLIDAYS;
  global.fetch = async () => {
    fetchCallCount += 1;
    return makeDailyResponse();
  };
  loadService();
});

test("persists a daily snapshot and reuses it after service reload", async () => {
  let service = loadService();
  const first = await service.getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(marketRecords.get("INFY").providerSymbol, "INFY.BSE");
  assert.equal(marketRecords.get("INFY").close, 105);
  assert.equal(marketRecords.get("INFY").date, "2026-10-09");
  assert.ok(marketRecords.get("INFY").fetchedAt instanceof Date);
  assert.equal(first.data.at(-1).date, "2026-10-09");
  assert.equal(first.data.length, 2);
  assert.equal(first.isStale, false);
  assert.deepEqual(updateOptions.mapping[0], {
    returnDocument: "after",
    upsert: true,
  });
  assert.deepEqual(updateOptions.cache[0], {
    returnDocument: "after",
    upsert: true,
    setDefaultsOnInsert: true,
  });
  assert.deepEqual(updateOptions.quota[0], {
    returnDocument: "after",
  });

  await service.getMarketHistory("INFY");
  assert.equal(fetchCallCount, 1);

  service = loadService();
  const afterRestart = await service.getMarketHistory("INFY");
  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
  assert.deepEqual(afterRestart.data, first.data);
});

test("returns a persisted successful quote after service restart", async () => {
  const initialQuote = await loadService().getMarketQuote("INFY");
  const quoteAfterRestart = await loadService().getMarketQuote("INFY");

  assert.equal(quoteAfterRestart.price, initialQuote.price);
  assert.equal(quoteAfterRestart.timestamp, initialQuote.timestamp);
  assert.equal(quoteAfterRestart.isStale, false);
  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
});

test("coalesces simultaneous requests for the same uncached symbol", async () => {
  let resolveProvider;
  global.fetch = () => {
    fetchCallCount += 1;
    return new Promise((resolve) => {
      resolveProvider = resolve;
    });
  };

  const service = loadService();
  const first = service.getMarketHistory("INFY");
  const second = service.getMarketHistory("INFY");
  while (!resolveProvider) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  resolveProvider(makeDailyResponse());

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(fetchCallCount, 1);
  assert.deepEqual(firstResult, secondResult);
});


test("does not exceed the daily quota across concurrent stale-symbol requests", async () => {
  setQuotaCount(24);
  for (const stock of [
    { symbol: "INFY", providerSymbol: "INFY.BSE", companyName: "Infosys Limited" },
    { symbol: "TCS", providerSymbol: "TCS.BSE", companyName: "Tata Consultancy Services Limited" },
  ]) {
    marketRecords.set(stock.symbol, {
      ...stock,
      date: "2026-10-08",
      close: 100,
      history: [{ date: "2026-10-08", close: 100 }],
      fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
      source: "Alpha Vantage",
      isStale: true,
    });

    symbolMappings.set(stock.symbol, {
      ...stock,
      lastFetchAttemptAt: null,
      lastFetchError: null,
      lastFetchErrorCode: null,
    });
  }

  const service = loadService();

  const results = await Promise.all([
    service.getMarketHistory("INFY"),
    service.getMarketHistory("TCS"),
  ]);

  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 25);
  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.data.length > 0));
});

test("prioritizes uncached symbols before stale cached refreshes within the shared quota", async () => {
  setQuotaCount(24);
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });
  const service = loadService();
  const groups = await service.getMarketDataRequestGroups(["INFY", "HUL"]);

  assert.deepEqual(groups.uncached, ["HUL"]);
  assert.deepEqual(groups.refreshable, ["INFY"]);

  const uncachedResult = await service.getMarketHistory(groups.uncached[0]);
  const cachedResult = await service.getMarketHistory(groups.refreshable[0]);

  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 25);
  assert.equal(uncachedResult.data.at(-1).date, "2026-10-09");
  assert.equal(cachedResult.isStale, true);
  assert.equal(cachedResult.data.at(-1).date, "2026-10-08");
});


test("does not refresh a close already fetched for the current market session", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-09",
    close: 105,
    history: [{ date: "2026-10-09", close: 105 }],
    fetchedAt: new Date("2026-10-09T12:00:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  });

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(result.isStale, false);
  assert.equal(result.data.at(-1).date, "2026-10-09");
  assert.equal(fetchCallCount, 0);
});

test("fetches completed historical closes for an uncached symbol during market hours", async (t) => {
  t.mock.timers.setTime(Date.parse("2026-10-09T04:30:00.000Z"));

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
  assert.equal(result.isStale, false);
  assert.equal(result.data.at(-1).date, "2026-10-08");
  assert.equal(result.data.at(-1).close, 100);
  assert.equal(marketRecords.get("INFY").date, "2026-10-08");
});

test("refreshes a future-dated persisted cache instead of returning its close", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-10",
    close: 999,
    history: [{ date: "2026-10-10", close: 999 }],
    fetchedAt: new Date("2026-10-10T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  });

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(result.data.at(-1).date, "2026-10-09");
  assert.equal(result.data.at(-1).close, 105);
  assert.notEqual(result.data.at(-1).close, 999);
});

test("selects the latest completed row from a cache containing a future row", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-10",
    close: 999,
    history: [
      { date: "2026-10-08", close: 100 },
      { date: "2026-10-09", close: 105 },
      { date: "2026-10-10", close: 999 },
    ],
    fetchedAt: new Date("2026-10-10T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  });
  symbolMappings.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    lastDailyFetchAttemptAt: new Date("2026-10-09T10:00:00.000Z"),
    lastDailyFetchAttemptHadCache: true,
    lastFetchError: null,
    lastFetchErrorCode: null,
  });

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(fetchCallCount, 0);
  assert.equal(result.data.at(-1).date, "2026-10-09");
  assert.equal(result.data.at(-1).close, 105);
  assert.ok(result.data.every((row) => row.date <= "2026-10-09"));
});

test("does not return a persisted close beyond the 30-day maximum stale age", async (t) => {
  t.mock.timers.setTime(Date.parse("2026-11-15T12:30:00.000Z"));
  setQuotaCount(25);
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });
  await assert.rejects(loadService().getMarketHistory("INFY"), {
    code: "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
  });

  assert.equal(fetchCallCount, 0);
  assert.equal(marketRecords.get("INFY").date, "2026-10-08");
});

test("returns a valid 21-day-old observation as stale when quota blocks refresh", async (t) => {
  t.mock.timers.setTime(Date.parse("2026-10-29T12:30:00.000Z"));
  setQuotaCount(25);
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-28T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(fetchCallCount, 0);
  assert.equal(result.isStale, true);
  assert.equal(result.data.at(-1).date, "2026-10-08");
  assert.equal(result.data.at(-1).close, 100);
});

test("keeps a recent stale cache available as a marked fallback", async (t) => {
  t.mock.timers.setTime(Date.parse("2026-10-29T12:30:00.000Z"));
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-28",
    close: 105,
    history: [{ date: "2026-10-28", close: 105 }],
    fetchedAt: new Date("2026-10-28T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });
  global.fetch = async () => {
    fetchCallCount += 1;
    return { ok: false, status: 503 };
  };

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(result.isStale, true);
  assert.equal(result.data.at(-1).date, "2026-10-28");
  assert.equal(result.data.at(-1).close, 105);
  assert.match(result.marketDataError, /unsuccessful response/i);
});

test("retains the latest completed close over the weekend without provider calls", async (t) => {
  t.mock.timers.tick(24 * 60 * 60 * 1000);
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-09",
    close: 105,
    history: [{ date: "2026-10-09", close: 105 }],
    fetchedAt: new Date("2026-10-09T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  });

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(result.isStale, false);
  assert.equal(result.data.at(-1).date, "2026-10-09");
  assert.equal(fetchCallCount, 0);
});

test("retains the latest close on a configured exchange holiday", async () => {
  process.env.INDIA_MARKET_HOLIDAYS = "2026-10-09";
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  });

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(result.isStale, false);
  assert.equal(result.data.at(-1).date, "2026-10-08");
  assert.equal(fetchCallCount, 0);
});

test("does not search the provider for unmapped symbols while the market is closed", async (t) => {
  t.mock.timers.tick(24 * 60 * 60 * 1000);

  await assert.rejects(loadService().getMarketHistory("NIFTY50"), {
    code: "MARKET_DATA_UNAVAILABLE",
  });

  assert.equal(fetchCallCount, 0);
});

test("persists unsupported-symbol failures to prevent repeated provider searches", async () => {
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({ bestMatches: [] }),
    };
  };

  await assert.rejects(loadService().getMarketHistory("NIFTY50"), {
    code: "UNSUPPORTED_MARKET_SYMBOL",
  });
  await assert.rejects(loadService().getMarketHistory("NIFTY50"), {
    code: "UNSUPPORTED_MARKET_SYMBOL",
  });

  assert.equal(fetchCallCount, 1);
  assert.equal(
    symbolMappings.get("NIFTY50").lastFetchErrorCode,
    "UNSUPPORTED_MARKET_SYMBOL",
  );
});

test("adds only known or provider-mapped symbols to a watchlist", async () => {
  const service = loadService();
  symbolMappings.set("ZENTEC.BSE", {
    symbol: "ZENTEC.BSE",
    providerSymbol: "ZENTEC.BSE",
    companyName: "Zen Technologies Limited",
  });

  assert.equal(await service.getWatchlistSymbol("infy"), "INFY");
  assert.equal(
    await service.getWatchlistSymbol("ZENTEC.BSE"),
    "ZENTEC.BSE",
  );
  await assert.rejects(service.getWatchlistSymbol("UNKNOWN"), {
    code: "UNSUPPORTED_MARKET_SYMBOL",
  });
  assert.equal(fetchCallCount, 0);
});

test("refreshes a stale cache once after the trading session closes", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });

  const service = loadService();
  const result = await service.getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(result.isStale, false);
  assert.equal(result.data.at(-1).date, "2026-10-09");
  await service.getMarketHistory("INFY");
  assert.equal(fetchCallCount, 1);
});

test("refreshes a cache after close when its initial fetch happened earlier that day", async (t) => {
  t.mock.timers.setTime(Date.parse("2026-10-09T04:30:00.000Z"));
  const service = loadService();

  const initialResult = await service.getMarketHistory("INFY");
  assert.equal(initialResult.data.at(-1).date, "2026-10-08");
  assert.equal(fetchCallCount, 1);
  assert.equal(symbolMappings.get("INFY").lastDailyFetchAttemptHadCache, false);

  t.mock.timers.setTime(Date.parse("2026-10-09T11:00:00.000Z"));
  const refreshedResult = await service.getMarketHistory("INFY");

  assert.equal(fetchCallCount, 2);
  assert.equal(getQuotaCount(), 2);
  assert.equal(refreshedResult.isStale, false);
  assert.equal(refreshedResult.data.at(-1).date, "2026-10-09");
  assert.equal(symbolMappings.get("INFY").lastDailyFetchAttemptHadCache, true);
});


test("does not retry a failed daily refresh after service reload on the same market day", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });

  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({
        Note: "Thank you for using Alpha Vantage. Your API call frequency has exceeded the limit.",
      }),
    };
  };

  const firstService = loadService();
  const firstResult = await firstService.getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(firstResult.isStale, true);
  assert.equal(firstResult.data.at(-1).close, 100);
  assert.equal(
    symbolMappings.get("INFY").lastFetchErrorCode,
    "MARKET_DATA_RATE_LIMITED",
  );

  const restartedService = loadService();
  const secondResult = await restartedService.getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(secondResult.isStale, true);
  assert.equal(secondResult.data.at(-1).close, 100);
});

test("retries an uncached symbol after a quota reservation block resets", async (t) => {
  setQuotaCount(25);
  const service = loadService();

  await assert.rejects(service.getMarketHistory("HUL"), {
    code: "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
  });
  assert.equal(fetchCallCount, 0);
  assert.equal(symbolMappings.get("HUL").lastDailyFetchAttemptAt, undefined);

  t.mock.timers.setTime(Date.parse("2026-10-10T00:01:00.000Z"));
  const result = await service.getMarketHistory("HUL");

  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
  assert.equal(result.data.at(-1).date, "2026-10-09");
});

test("retries an uncached symbol after a persisted provider cooldown expires", async (t) => {
  t.mock.timers.setTime(Date.parse("2026-10-09T20:00:00.000Z"));
  setQuotaCount(24);
  global.fetch = async () => {
    fetchCallCount += 1;
    if (fetchCallCount === 1) {
      return {
        ok: true,
        json: async () => ({
          Note: "Thank you for using Alpha Vantage. Your API call frequency has exceeded the limit.",
        }),
      };
    }
    return makeDailyResponse();
  };

  const service = loadService();
  await assert.rejects(service.getMarketHistory("HUL"), {
    code: "MARKET_DATA_RATE_LIMITED",
  });
  await assert.rejects(service.getMarketHistory("HUL"), {
    code: "MARKET_DATA_RATE_LIMITED",
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount("2026-10-09"), 25);

  t.mock.timers.setTime(Date.parse("2026-10-10T00:01:00.000Z"));
  const result = await service.getMarketHistory("HUL");

  assert.equal(fetchCallCount, 2);
  assert.equal(getQuotaCount("2026-10-10"), 1);
  assert.equal(result.data.at(-1).date, "2026-10-09");
});

test("does not retry genuine provider failures on every request", async () => {
  global.fetch = async () => {
    fetchCallCount += 1;
    return { ok: false, status: 503 };
  };
  const service = loadService();

  await assert.rejects(service.getMarketHistory("HUL"), {
    code: "MARKET_DATA_PROVIDER_ERROR",
  });
  await assert.rejects(service.getMarketHistory("HUL"), {
    code: "MARKET_DATA_PROVIDER_ERROR",
  });

  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
});

test("does not overwrite a valid cache when provider rows have no completed candle", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-08",
    close: 100,
    history: [{ date: "2026-10-08", close: 100 }],
    fetchedAt: new Date("2026-10-08T12:30:00.000Z"),
    source: "Alpha Vantage",
    isStale: true,
  });
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({
        "Time Series (Daily)": {
          "2026-10-10": {
            "1. open": "100",
            "2. high": "110",
            "3. low": "95",
            "4. close": "999",
            "5. volume": "1000",
          },
        },
      }),
    };
  };

  const result = await loadService().getMarketHistory("INFY");

  assert.equal(fetchCallCount, 1);
  assert.equal(result.isStale, true);
  assert.equal(result.data.at(-1).date, "2026-10-08");
  assert.equal(marketRecords.get("INFY").date, "2026-10-08");
  assert.equal(marketRecords.get("INFY").close, 100);
});


test("returns persisted data as stale after an Alpha Vantage rate-limit response", async () => {
  const oldRecord = {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-06",
    open: 90,
    high: 105,
    low: 89,
    close: 100,
    volume: 1200,
    history: [
      {
        date: "2026-10-06",
        open: 90,
        high: 105,
        low: 89,
        close: 100,
        volume: 1200,
      },
    ],
    fetchedAt: new Date("2026-10-06T10:00:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  };
  marketRecords.set("INFY", oldRecord);
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({
        Note: "Thank you for using Alpha Vantage. Your API call frequency has exceeded the limit.",
      }),
    };
  };

  const result = await loadService().getMarketHistory("INFY");
  assert.equal(fetchCallCount, 1);
  assert.equal(result.isStale, true);
  assert.equal(result.data[0].close, 100);
  assert.equal(marketRecords.get("INFY").close, oldRecord.close);
  assert.equal(marketRecords.get("INFY").isStale, true);

  const afterRestart = await loadService().getMarketHistory("INFY");
  assert.equal(afterRestart.isStale, true);
  assert.equal(afterRestart.data[0].close, 100);
  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
});

test("keeps the rate-limit cooldown across service restarts and leaves HUL unavailable", async () => {
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({
        Note: "Thank you for using Alpha Vantage. Your API call frequency has exceeded the limit.",
      }),
    };
  };

  const firstService = loadService();
  await assert.rejects(firstService.getMarketQuote("HUL"), {
    code: "MARKET_DATA_RATE_LIMITED",
    statusCode: 429,
    message: /request limit has been reached/i,
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(marketRecords.has("HUL"), false);
  assert.ok(getQuotaCooldownUntil() > new Date());

  const restartedService = loadService();
  await assert.rejects(restartedService.getMarketQuote("HUL"), {
    code: "MARKET_DATA_RATE_LIMITED",
    statusCode: 429,
  });
  await assert.rejects(restartedService.getMarketQuote("TCS"), {
    code: "MARKET_DATA_RATE_LIMITED",
    statusCode: 429,
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
  assert.equal(marketRecords.has("HUL"), false);
  assert.equal(symbolMappings.get("TCS").lastDailyFetchAttemptAt, undefined);
});

test("persists the cooldown when Alpha Vantage responds with HTTP 429", async () => {
  global.fetch = async () => {
    fetchCallCount += 1;
    return { ok: false, status: 429 };
  };

  await assert.rejects(loadService().getMarketHistory("HUL"), {
    code: "MARKET_DATA_RATE_LIMITED",
    statusCode: 429,
    message: /request limit has been reached/i,
  });
  await assert.rejects(loadService().getMarketHistory("QUICKHEAL"), {
    code: "MARKET_DATA_RATE_LIMITED",
    statusCode: 429,
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(getQuotaCount(), 1);
  assert.ok(getQuotaCooldownUntil() > new Date());
});

test("retries after the persisted daily quota window expires", async (t) => {
  global.fetch = async () => {
    fetchCallCount += 1;
    if (fetchCallCount === 1) {
      return {
        ok: true,
        json: async () => ({
          Note: "Thank you for using Alpha Vantage. Your API call frequency has exceeded the limit.",
        }),
      };
    }
    return makeDailyResponse();
  };

  const service = loadService();
  await assert.rejects(service.getMarketHistory("HUL"), {
    code: "MARKET_DATA_RATE_LIMITED",
  });
  t.mock.timers.tick(72 * 60 * 60 * 1000);

  const result = await service.getMarketHistory("HUL");
  assert.equal(fetchCallCount, 2);
  assert.equal(result.isStale, true);
});

test("does not spend quota or call the provider when the API key is missing", async () => {
  delete process.env.ALPHA_VANTAGE_API_KEY;

  await assert.rejects(loadService().getMarketHistory("INFY"), {
    code: "MARKET_DATA_NOT_CONFIGURED",
  });
  assert.equal(fetchCallCount, 0);
  assert.equal(getQuotaCount(), 0);
});

test("calculates quote changes from the previous trading close", async () => {
  const quote = await loadService().getMarketQuote("INFY");
  assert.equal(quote.price, 105);
  assert.equal(quote.previousClose, 100);
  assert.equal(quote.change, 5);
  assert.equal(quote.changePercent, 5);
  assert.equal(quote.timestamp, "2026-10-09");
});

test("blocks provider calls after the persistent daily quota is exhausted", async () => {
  setQuotaCount(25);
  await assert.rejects(loadService().getMarketHistory("INFY"), {
    code: "MARKET_DATA_DAILY_QUOTA_EXHAUSTED",
    statusCode: 429,
  });
  assert.equal(fetchCallCount, 0);
});

test("falls back to cached prices when the configured API key is rejected", async () => {
  marketRecords.set("INFY", {
    symbol: "INFY",
    providerSymbol: "INFY.BSE",
    companyName: "Infosys Limited",
    date: "2026-10-06",
    close: 100,
    history: [{ date: "2026-10-06", close: 100 }],
    fetchedAt: new Date("2026-10-06T10:00:00.000Z"),
    source: "Alpha Vantage",
    isStale: false,
  });
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({
        Information: "The parameter apikey is invalid or missing.",
      }),
    };
  };

  const result = await loadService().getMarketHistory("INFY");
  assert.equal(fetchCallCount, 1);
  assert.equal(result.isStale, true);
  assert.equal(result.data[0].close, 100);
});

test("does not invent or persist a HUL quote when no daily series is returned", async () => {
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({ "Error Message": "Invalid API call." }),
    };
  };

  await assert.rejects(loadService().getMarketQuote("HUL"), {
    code: "UNSUPPORTED_MARKET_SYMBOL",
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(marketRecords.has("HUL"), false);
  await assert.rejects(loadService().getMarketQuote("HUL"), {
    code: "UNSUPPORTED_MARKET_SYMBOL",
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(
    symbolMappings.get("HUL").lastFetchErrorCode,
    "UNSUPPORTED_MARKET_SYMBOL",
  );
});

test("uses persisted symbol-search results instead of repeating SYMBOL_SEARCH", async () => {
  let service = loadService();
  global.fetch = async () => {
    fetchCallCount += 1;
    return {
      ok: true,
      json: async () => ({
        bestMatches: [
          {
            "1. symbol": "ZENTEC.BSE",
            "2. name": "Zen Technologies Limited",
            "3. type": "Equity",
            "4. region": "India",
            "8. currency": "INR",
            "9. matchScore": "0.99",
          },
        ],
      }),
    };
  };

  const initial = await service.searchMarketSymbols("zentec");
  assert.equal(fetchCallCount, 1);
  assert.equal(initial[0].symbol, "ZENTEC.BSE");

  service = loadService();
  const afterRestart = await service.searchMarketSymbols("zentec");
  assert.equal(fetchCallCount, 1);
  assert.deepEqual(afterRestart, initial);
});

test("calculates known portfolio totals without counting missing prices as zero", () => {
  const holdings = [
    {
      name: "KPITTECH",
      costValue: 2664.5,
      currentValue: 4721,
      unrealizedPnL: 2056.5,
      marketDataUnavailable: false,
    },
    {
      name: "HUL",
      costValue: 5000,
      currentValue: null,
      unrealizedPnL: null,
      marketDataUnavailable: true,
    },
  ];
  const positions = [
    {
      name: "HUL",
      qty: 1,
      avg: 5000,
      marketDataUnavailable: true,
    },
  ];
  const orders = [
    {
      symbol: "KPITTECH",
      type: "BUY",
      quantity: 1,
      price: 2664.5,
      totalAmount: 2664.5,
    },
  ];
  const originalTradingRecords = structuredClone({
    holdings,
    positions,
    orders,
  });

  const summary = summarizePortfolio(holdings, positions, 10000);

  assert.equal(summary.portfolioValue, 4721);
  assert.equal(summary.unrealizedPnL, 2056.5);
  assert.equal(summary.accountEquity, 14721);
  assert.equal(summary.totalInvestment, 7664.5);
  assert.equal(summary.portfolioValueIsPartial, true);
  assert.equal(summary.accountEquityIsPartial, true);
  assert.equal(summary.unrealizedPnLIsPartial, true);
  assert.deepEqual(summary.excludedHoldings, ["HUL"]);
  assert.equal(summary.marketDataUnavailable, true);
  assert.deepEqual({ holdings, positions, orders }, originalTradingRecords);
});

test("restores complete totals when every holding has a valid price", () => {
  const summary = summarizePortfolio(
    [
      {
        name: "KPITTECH",
        costValue: 2664.5,
        currentValue: 4721,
        unrealizedPnL: 2056.5,
        marketDataUnavailable: false,
      },
      {
        name: "INFY",
        costValue: 4000,
        currentValue: 4500,
        unrealizedPnL: 500,
        marketDataUnavailable: false,
      },
    ],
    [],
    10000,
  );

  assert.equal(summary.portfolioValue, 9221);
  assert.equal(summary.unrealizedPnL, 2556.5);
  assert.equal(summary.accountEquity, 19221);
  assert.equal(summary.portfolioValueIsPartial, false);
  assert.equal(summary.accountEquityIsPartial, false);
  assert.equal(summary.unrealizedPnLIsPartial, false);
  assert.deepEqual(summary.excludedHoldings, []);
  assert.equal(summary.marketDataUnavailable, false);
});

test.after(() => {
  global.fetch = originalFetch;
  delete process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.INDIA_MARKET_HOLIDAYS;
});
