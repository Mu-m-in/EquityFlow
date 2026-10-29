const ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_CACHE_TTL_MS = 7 * CACHE_TTL_MS;
const MAX_STALE_DAILY_AGE_MS = 30 * CACHE_TTL_MS;
const MAX_REQUESTS_PER_24H = 25;
const SOURCE = "Alpha Vantage";
const RATE_LIMITED_CODE = "MARKET_DATA_RATE_LIMITED";
const DAILY_QUOTA_EXHAUSTED_CODE = "MARKET_DATA_DAILY_QUOTA_EXHAUSTED";
const INDIA_TIME_ZONE = "Asia/Kolkata";
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;
const KNOWN_SYMBOLS = [
  { symbol: "INFY", providerSymbol: "INFY.BSE", companyName: "Infosys Limited" },
  { symbol: "ONGC", providerSymbol: "ONGC.BSE", companyName: "Oil & Natural Gas Corporation Limited" },
  { symbol: "TCS", providerSymbol: "TCS.BSE", companyName: "Tata Consultancy Services Limited" },
  { symbol: "KPITTECH", providerSymbol: "KPITTECH.BSE", companyName: "KPIT Technologies Limited" },
  { symbol: "QUICKHEAL", providerSymbol: "QUICKHEAL.BSE", companyName: "Quick Heal Technologies Limited" },
  { symbol: "WIPRO", providerSymbol: "WIPRO.BSE", companyName: "Wipro Limited" },
  { symbol: "M&M", providerSymbol: "M&M.BSE", companyName: "Mahindra & Mahindra Limited" },
  { symbol: "RELIANCE", providerSymbol: "RELIANCE.BSE", companyName: "Reliance Industries Limited" },
  { symbol: "HUL", providerSymbol: "HUL.BSE", companyName: "Hindustan Unilever Limited" },
];
const caches = {
  search: new Map(),
};
const inFlightRequests = new Map();
const failedRequests = new Map();
const dailyRequestsInFlight = new Map();
const symbolResolutionsInFlight = new Map();
const { MarketDataCacheModel } = require("../model/MarketDataCacheModel");
const { MarketSymbolMappingModel } = require("../model/MarketSymbolMappingModel");
const { AlphaVantageQuotaModel } = require("../model/AlphaVantageQuotaModel");
const { logMarketDataUnavailable } = require("./marketDataLogging");

class MarketDataError extends Error {
  constructor(message, statusCode = 502, code = "MARKET_DATA_UNAVAILABLE") {
    super(message);
    this.name = "MarketDataError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const cacheValue = (cache, key, value) => {
  const now = Date.now();
  cache.set(key, {
    value,
    isStale: false,
    expiresAt: now + CACHE_TTL_MS,
    staleUntil: now + CACHE_TTL_MS + STALE_CACHE_TTL_MS,
  });
};

const getQuotaWindowEnd = (date = new Date()) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + 1,
    ),
  );

const isValidDailyDate = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    return false;
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const isCompletedDailyRow = (row, completedSessionDate) =>
  row &&
  isValidDailyDate(row.date) &&
  row.date <= completedSessionDate &&
  Number.isFinite(row.close);

const isWithinMaximumStaleAge = (date, completedSessionDate) => {
  const observationAge =
    Date.parse(`${completedSessionDate}T00:00:00.000Z`) -
    Date.parse(`${date}T00:00:00.000Z`);
  return observationAge >= 0 && observationAge <= MAX_STALE_DAILY_AGE_MS;
};

const getUsableCachedRecord = (record, now = new Date()) => {
  if (!record) {
    return null;
  }

  const completedSessionDate = getLatestCompletedSessionDate(now);
  const rowsByDate = new Map();
  for (const row of Array.isArray(record.history) ? record.history : []) {
    if (isCompletedDailyRow(row, completedSessionDate)) {
      rowsByDate.set(row.date, row);
    }
  }
  if (isCompletedDailyRow(record, completedSessionDate)) {
    rowsByDate.set(
      record.date,
      Object.fromEntries(
        ["date", "open", "high", "low", "close", "volume"]
          .filter((key) => Object.hasOwn(record, key))
          .map((key) => [key, record[key]]),
      ),
    );
  }

  const history = [...rowsByDate.values()].sort((first, second) =>
    first.date.localeCompare(second.date),
  );
  const latest = history.at(-1);
  if (!latest) {
    return null;
  }

  if (!isWithinMaximumStaleAge(latest.date, completedSessionDate)) {
    return null;
  }

  return { ...record, ...latest, history };
};

const getRetryAt = (error, failedAt = new Date()) =>
  error.statusCode === 429
    ? getQuotaWindowEnd(failedAt)
    : new Date(
        failedAt.getTime() +
          (error.code === "MARKET_DATA_NOT_CONFIGURED"
            ? 30 * 1000
            : 5 * 60 * 1000),
      );

const loadCached = async (cache, key, loader) => {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && now < cached.expiresAt) {
    return { value: cached.value, isStale: cached.isStale };
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const failedRequest = failedRequests.get(key);
  if (failedRequest && now < failedRequest.retryAt) {
    if (cached && now < cached.staleUntil) {
      return { value: cached.value, isStale: true };
    }
    throw failedRequest.error;
  }

  const request = (async () => {
    try {
      const value = await loader();
      cacheValue(cache, key, value);
      failedRequests.delete(key);
      return { value, isStale: false };
    } catch (error) {
      const failedAt = Date.now();
      failedRequests.set(key, {
        error,
        retryAt: getRetryAt(error, new Date(failedAt)).getTime(),
      });
      if (cached && Date.now() < cached.staleUntil) {
        cached.isStale = true;
        cached.expiresAt = Math.min(
          getRetryAt(error, new Date(failedAt)).getTime(),
          cached.staleUntil,
        );
        return { value: cached.value, isStale: true };
      }
      throw error;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, request);
  return request;
};

const reserveDailyRequest = async () => {
  const day = new Date().toISOString().slice(0, 10);
  const quotaState = await AlphaVantageQuotaModel.findOne({ _id: day }).lean();
  if (quotaState?.cooldownUntil && quotaState.cooldownUntil > new Date()) {
    throw new MarketDataError(
      "Alpha Vantage's request limit has been reached. Please try again later.",
      429,
      RATE_LIMITED_CODE,
    );
  }
  try {
    await AlphaVantageQuotaModel.updateOne(
      { _id: day },
      { $setOnInsert: { count: 0 } },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }
  const quota = await AlphaVantageQuotaModel.findOneAndUpdate(
    { _id: day, count: { $lt: MAX_REQUESTS_PER_24H } },
    { $inc: { count: 1 } },
    { returnDocument: "after" },
  );
  if (!quota) {
    throw new MarketDataError(
      "The daily Alpha Vantage request budget has been reached. Please try again later.",
      429,
      DAILY_QUOTA_EXHAUSTED_CODE,
    );
  }
};

const persistProviderCooldown = async () => {
  const cooldownUntil = getQuotaWindowEnd();
  try {
    await AlphaVantageQuotaModel.updateOne(
      { _id: new Date().toISOString().slice(0, 10) },
      { $max: { cooldownUntil } },
    );
  } catch (error) {
    console.error("Unable to persist Alpha Vantage quota cooldown", error);
  }
};

const getMarketDayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const getIndiaMarketClock = (date) => {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: INDIA_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const parts = Object.fromEntries(values.map(({ type, value }) => [type, value]));
  return {
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
};

const getConfiguredMarketHolidays = () => {
  const holidays = (process.env.INDIA_MARKET_HOLIDAYS || "")
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean);
  for (const date of holidays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(
        "INDIA_MARKET_HOLIDAYS must contain comma-separated YYYY-MM-DD dates.",
      );
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error(
        "INDIA_MARKET_HOLIDAYS must contain valid YYYY-MM-DD dates.",
      );
    }
  }
  return new Set(holidays);
};

const isIndiaTradingDay = (dateKey, holidays) => {
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(dateKey);
};

const getPreviousMarketSession = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const holidays = getConfiguredMarketHolidays();
  do {
    date.setUTCDate(date.getUTCDate() - 1);
  } while (!isIndiaTradingDay(date.toISOString().slice(0, 10), holidays));
  return date.toISOString().slice(0, 10);
};

const getLatestCompletedSessionDate = (now = new Date()) => {
  const dateKey = getMarketDayKey(now);
  const { weekday, minutes } = getIndiaMarketClock(now);
  const holidays = getConfiguredMarketHolidays();
  const isCompletedTradingDay =
    weekday !== "Sat" &&
    weekday !== "Sun" &&
    !holidays.has(dateKey) &&
    minutes >= MARKET_CLOSE_MINUTES;
  return isCompletedTradingDay
    ? dateKey
    : getPreviousMarketSession(dateKey);
};

const canRefreshDailyData = (now = new Date()) => {
  const { weekday, minutes } = getIndiaMarketClock(now);
  const dateKey = getMarketDayKey(now);
  return (
    weekday !== "Sat" &&
    weekday !== "Sun" &&
    !getConfiguredMarketHolidays().has(dateKey) &&
    minutes >= MARKET_CLOSE_MINUTES
  );
};

const isRecordStale = (record, now = new Date()) =>
  record.date < getLatestCompletedSessionDate(now);

const getMarketDataRequestGroups = async (symbols, now = new Date()) => {
  const cachedRecords = await MarketDataCacheModel.find({
    symbol: { $in: symbols },
  }).lean();
  const recordsBySymbol = new Map(
    cachedRecords.map((record) => [record.symbol, record]),
  );
  const groups = { uncached: [], refreshable: [], cached: [] };

  for (const symbol of symbols) {
    const record = getUsableCachedRecord(recordsBySymbol.get(symbol), now);
    if (!record) {
      groups.uncached.push(symbol);
    } else if (isRecordStale(record, now)) {
      groups.refreshable.push(symbol);
    } else {
      groups.cached.push(symbol);
    }
  }

  return groups;
};

const wasAttemptedToday = (mapping, now = new Date()) =>
  mapping.lastFetchAttemptAt &&
  getMarketDayKey(mapping.lastFetchAttemptAt) === getMarketDayKey(now);

const wasDailyFetchAttemptedToday = (mapping, now = new Date()) => {
  const wasAttemptedToday =
    mapping.lastDailyFetchAttemptAt &&
    getMarketDayKey(mapping.lastDailyFetchAttemptAt) === getMarketDayKey(now);
  if (
    wasAttemptedToday &&
    mapping.lastFetchErrorCode === RATE_LIMITED_CODE &&
    now >= getQuotaWindowEnd(mapping.lastDailyFetchAttemptAt)
  ) {
    return false;
  }
  return wasAttemptedToday;
};

const persistFetchStatus = async (symbol, values) => {
  await MarketSymbolMappingModel.updateOne(
    { symbol },
    { $set: values },
    { upsert: true },
  );
};

const cachedDailyResult = async (symbol, record, mapping, now, fetchError) => {
  record = getUsableCachedRecord(record, now);
  if (!record) {
    throw new MarketDataError(
      "No recent completed-session close is available.",
      503,
      "MARKET_DATA_UNAVAILABLE",
    );
  }
  const isStale = isRecordStale(record, now);
  if (Boolean(record.isStale) !== isStale) {
    await MarketDataCacheModel.updateOne(
      { symbol },
      { $set: { isStale } },
    );
  }
  return {
    record,
    isStale,
    fetchError: fetchError || mapping.lastFetchError || null,
  };
};

const statusCodeForFetchError = (code) => {
  if (code === RATE_LIMITED_CODE) {
    return 429;
  }
  if (code === "UNSUPPORTED_MARKET_SYMBOL") {
    return 404;
  }
  return 503;
};

const requestAlphaVantage = async (parameters, { onRequestStarted } = {}) => {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new MarketDataError(
      "Market data is not configured. Add ALPHA_VANTAGE_API_KEY to the backend .env file.",
      503,
      "MARKET_DATA_NOT_CONFIGURED",
    );
  }

  const url = new URL(ALPHA_VANTAGE_URL);
  for (const [name, value] of Object.entries(parameters)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("apikey", apiKey);
  await reserveDailyRequest();

  let response;
  const requestStartedAt = new Date();
  const responsePromise = Promise.resolve()
    .then(() => fetch(url, { signal: AbortSignal.timeout(15000) }))
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  try {
    await onRequestStarted?.(requestStartedAt);
  } catch (error) {
    console.error("Unable to persist market-data request attempt", error);
  }
  const responseResult = await responsePromise;
  if (responseResult.error) {
    const error = responseResult.error;
    const statusCode = error.name === "TimeoutError" ? 504 : 502;
    throw new MarketDataError(
      statusCode === 504
        ? "The market-data provider timed out. Please try again later."
        : "Unable to reach the market-data provider. Please try again later.",
      statusCode,
      "MARKET_DATA_PROVIDER_UNAVAILABLE",
    );
  }
  response = responseResult.value;

  if (response.status === 429) {
    await persistProviderCooldown();
    throw new MarketDataError(
      "Alpha Vantage's request limit has been reached. Please try again later.",
      429,
      RATE_LIMITED_CODE,
    );
  }

  if (!response.ok) {
    throw new MarketDataError(
      "The market-data provider returned an unsuccessful response.",
      502,
      "MARKET_DATA_PROVIDER_ERROR",
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new MarketDataError(
      "The market-data provider returned malformed data.",
      502,
      "MALFORMED_MARKET_DATA",
    );
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MarketDataError(
      "The market-data provider returned malformed data.",
      502,
      "MALFORMED_MARKET_DATA",
    );
  }

  if (payload.Note || payload.Information) {
    const providerMessage = String(payload.Note || payload.Information);
    const isRateLimited =
      /frequency|rate.?limit|requests per day|requests per minute/i.test(
        providerMessage,
      );
    if (isRateLimited) {
      await persistProviderCooldown();
    }
    throw new MarketDataError(
      isRateLimited
        ? "Alpha Vantage's request limit has been reached. Please try again later."
        : "Alpha Vantage rejected the request. Check the API key and requested market data.",
      isRateLimited ? 429 : 503,
      isRateLimited ? RATE_LIMITED_CODE : "MARKET_DATA_PROVIDER_REJECTED",
    );
  }

  if (payload["Error Message"]) {
    throw new MarketDataError(
      "No supported market data was found for that symbol.",
      404,
      "UNSUPPORTED_MARKET_SYMBOL",
    );
  }

  return payload;
};

const normalizeSearchMatches = (payload) => {
  if (!Array.isArray(payload.bestMatches)) {
    throw new MarketDataError(
      "The market-data provider returned malformed search results.",
      502,
      "MALFORMED_MARKET_DATA",
    );
  }

  return payload.bestMatches
    .filter(
      (match) =>
        typeof match["1. symbol"] === "string" &&
        typeof match["2. name"] === "string",
    )
    .map((match) => ({
      symbol: match["1. symbol"].toUpperCase(),
      companyName: match["2. name"],
      type: match["3. type"] || null,
      region: match["4. region"] || null,
      currency: match["8. currency"] || null,
      matchScore: Number(match["9. matchScore"]) || 0,
    }));
};

const getSymbolSearchMatches = async (query) => {
  const normalizedQuery = query.toUpperCase();
  return loadCached(caches.search, `search:${normalizedQuery}`, async () =>
    normalizeSearchMatches(
      await requestAlphaVantage({
        function: "SYMBOL_SEARCH",
        keywords: query,
      }),
    ),
  );
};

const normalizeSearchQuery = (query) => query.trim().toLowerCase();

const searchResultFromMapping = (mapping, isStale = false) => ({
  symbol: mapping.providerSymbol,
  companyName: mapping.companyName,
  region: mapping.region,
  isStale,
});

const searchMarketSymbols = async (keywords) => {
  const query = String(keywords || "").trim();
  if (query.length < 2 || query.length > 50) {
    throw new MarketDataError(
      "Search keywords must be between 2 and 50 characters.",
      400,
      "INVALID_SEARCH",
    );
  }

  const queryKey = normalizeSearchQuery(query);
  const normalizedTicker = normalizeTicker(query);
  const knownMatches = KNOWN_SYMBOLS.filter(
    (known) =>
      (normalizedTicker.length > 0 &&
        normalizeTicker(known.symbol).startsWith(normalizedTicker)) ||
      known.companyName.toLowerCase().includes(queryKey),
  );
  if (knownMatches.length > 0) {
    return knownMatches.map((match) => searchResultFromMapping(match));
  }

  const persistedSearch = await MarketSymbolMappingModel.find({
    searchQueries: queryKey,
  }).lean();
  if (persistedSearch.length > 0) {
    return persistedSearch.map((mapping) => searchResultFromMapping(mapping));
  }

  const persistedSymbol = await MarketSymbolMappingModel.findOne({
    $or: [{ symbol: query.toUpperCase() }, { providerSymbol: query.toUpperCase() }],
  }).lean();
  if (persistedSymbol?.providerSymbol) {
    return [searchResultFromMapping(persistedSymbol)];
  }
  if (persistedSymbol && wasAttemptedToday(persistedSymbol)) {
    const code = persistedSymbol.lastFetchErrorCode || "MARKET_DATA_UNAVAILABLE";
    throw new MarketDataError(
      persistedSymbol.lastFetchError ||
        "Market data was already checked for this symbol today.",
      statusCodeForFetchError(code),
      code,
    );
  }

  const cached = await getSymbolSearchMatches(query);
  await Promise.all(
    cached.value.map(async (match) => {
      const known = KNOWN_SYMBOLS.find(
        (entry) => entry.providerSymbol === match.symbol,
      );
      const symbol = known?.symbol || match.symbol;
      const mapping = {
        symbol,
        providerSymbol: match.symbol,
        companyName: match.companyName,
        type: match.type,
        region: match.region,
        currency: match.currency,
        matchScore: match.matchScore,
      };
      await MarketSymbolMappingModel.updateOne(
        { symbol },
        {
          $setOnInsert: mapping,
          $addToSet: { searchQueries: queryKey },
        },
        { upsert: true },
      );
    }),
  );
  return cached.value.map((match) => ({
    symbol: match.symbol,
    companyName: match.companyName,
    region: match.region,
    isStale: cached.isStale,
  }));
};

const normalizeTicker = (symbol) => symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");

const resolveProviderSymbol = async (symbol) => {
  if (symbolResolutionsInFlight.has(symbol)) {
    return symbolResolutionsInFlight.get(symbol);
  }
  const resolution = resolveProviderSymbolOnce(symbol);
  symbolResolutionsInFlight.set(symbol, resolution);
  try {
    return await resolution;
  } finally {
    symbolResolutionsInFlight.delete(symbol);
  }
};

const resolveProviderSymbolOnce = async (symbol) => {
  const known = KNOWN_SYMBOLS.find((entry) => entry.symbol === symbol);
  if (known) {
    const persisted = await MarketSymbolMappingModel.findOneAndUpdate(
      { symbol: known.symbol },
      { $setOnInsert: known },
      { returnDocument: "after", upsert: true },
    ).lean();
    return persisted.toObject ? persisted.toObject() : persisted;
  }

  const persisted = await MarketSymbolMappingModel.findOne({
    $or: [{ symbol }, { providerSymbol: symbol }],
  }).lean();
  if (persisted?.providerSymbol) {
    return persisted;
  }
  if (persisted && wasAttemptedToday(persisted)) {
    const code = persisted.lastFetchErrorCode || "MARKET_DATA_UNAVAILABLE";
    throw new MarketDataError(
      persisted.lastFetchError ||
        "Market data was already checked for this symbol today.",
      statusCodeForFetchError(code),
      code,
    );
  }

  await persistFetchStatus(symbol, {
    lastFetchAttemptAt: new Date(),
    lastFetchError: null,
    lastFetchErrorCode: null,
  });
  try {
    const { value: matches, isStale } = await getSymbolSearchMatches(symbol);
    const normalizedSymbol = normalizeTicker(symbol);
    if (symbol.includes(".")) {
      const exactProviderMatch = matches.find(
        (match) => match.symbol.toUpperCase() === symbol.toUpperCase(),
      );
      if (exactProviderMatch) {
        const chosen = exactProviderMatch;
        const mappedSymbol =
          KNOWN_SYMBOLS.find((entry) => entry.providerSymbol === chosen.symbol)
            ?.symbol || symbol;
        await persistResolvedSymbol(mappedSymbol, chosen);
        return { ...chosen, symbol: mappedSymbol, isStale };
      }
    }

    const exactTickerMatches = matches.filter(
      (match) =>
        normalizeTicker(match.symbol.split(".")[0]) === normalizedSymbol,
    );
    if (exactTickerMatches.length === 0) {
      throw new MarketDataError(
        `Alpha Vantage did not find a supported match for ${symbol}.`,
        404,
        "UNSUPPORTED_MARKET_SYMBOL",
      );
    }

    const indiaMatches = exactTickerMatches.filter((match) =>
      /india/i.test(match.region || ""),
    );
    const candidates =
      indiaMatches.length > 0 ? indiaMatches : exactTickerMatches;

    candidates.sort((first, second) => {
      const firstBse = /\.BSE$/i.test(first.symbol);
      const secondBse = /\.BSE$/i.test(second.symbol);
      if (firstBse !== secondBse) {
        return firstBse ? -1 : 1;
      }
      return second.matchScore - first.matchScore;
    });

    const chosen = candidates[0];
    const mappedSymbol =
      KNOWN_SYMBOLS.find((entry) => entry.providerSymbol === chosen.symbol)
        ?.symbol || symbol;
    await persistResolvedSymbol(mappedSymbol, chosen);
    return { ...chosen, symbol: mappedSymbol, isStale };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The market-data provider returned an unknown error.";
    const code =
      error instanceof MarketDataError
        ? error.code
        : "MARKET_DATA_PROVIDER_UNAVAILABLE";
    await persistFetchStatus(symbol, {
      lastFetchError: message,
      lastFetchErrorCode: code,
    });
    logMarketDataUnavailable(symbol, error);
    throw error;
  }
};

const persistResolvedSymbol = async (symbol, match) => {
  await MarketSymbolMappingModel.updateOne(
    { symbol },
    {
      $set: {
        providerSymbol: match.symbol,
        companyName: match.companyName,
        type: match.type,
        region: match.region,
        currency: match.currency,
        matchScore: match.matchScore,
        lastFetchError: null,
        lastFetchErrorCode: null,
      },
      $addToSet: { searchQueries: normalizeSearchQuery(symbol) },
    },
    { upsert: true },
  );
};

const parseDailySeries = (payload) => {
  const series = payload["Time Series (Daily)"];
  if (!series || typeof series !== "object" || Array.isArray(series)) {
    throw new MarketDataError(
      "No daily price history was returned for that symbol.",
      404,
      "UNSUPPORTED_MARKET_SYMBOL",
    );
  }

  const rows = Object.entries(series)
    .map(([date, values]) => ({
      date,
      open: Number(values["1. open"]),
      high: Number(values["2. high"]),
      low: Number(values["3. low"]),
      close: Number(values["4. close"]),
      volume: Number(values["5. volume"]),
    }))
    .filter(
      (row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
        [row.open, row.high, row.low, row.close, row.volume].every(
          Number.isFinite,
        ),
    )
    .sort((first, second) => first.date.localeCompare(second.date));

  if (rows.length === 0) {
    throw new MarketDataError(
      "The market-data provider returned no valid daily prices.",
      502,
      "MALFORMED_MARKET_DATA",
    );
  }

  return rows;
};

const getDailySeries = async (symbol, mapping) => {
  const now = new Date();
  const persistedCache = await MarketDataCacheModel.findOne({ symbol }).lean();
  const cached = getUsableCachedRecord(persistedCache, now);
  const cacheKey = `daily:${symbol}`;
  if (dailyRequestsInFlight.has(cacheKey)) {
    return dailyRequestsInFlight.get(cacheKey);
  }

  if (cached && !isRecordStale(cached, now)) {
    return cachedDailyResult(symbol, cached, mapping, now);
  }

  if (cached && !canRefreshDailyData(now)) {
    return cachedDailyResult(symbol, cached, mapping, now);
  }

  if (
    wasDailyFetchAttemptedToday(mapping, now) &&
    (!cached || mapping.lastDailyFetchAttemptHadCache !== false)
  ) {
    if (cached) {
      return cachedDailyResult(symbol, cached, mapping, now);
    }
    const code = mapping.lastFetchErrorCode || "MARKET_DATA_UNAVAILABLE";
    throw new MarketDataError(
      mapping.lastFetchError ||
        "Market data was already checked for this session and is unavailable.",
      statusCodeForFetchError(code),
      code,
    );
  }

  let providerRequestStarted = false;
  const request = (async () => {
    try {
      const completedSessionDate = getLatestCompletedSessionDate(new Date());
      const rows = parseDailySeries(
        await requestAlphaVantage({
          function: "TIME_SERIES_DAILY",
          symbol: mapping.providerSymbol,
          outputsize: "compact",
        }, {
          onRequestStarted: async (attemptedAt) => {
            providerRequestStarted = true;
            await persistFetchStatus(symbol, {
              lastFetchAttemptAt: attemptedAt,
              lastDailyFetchAttemptAt: attemptedAt,
              lastDailyFetchAttemptHadCache: Boolean(cached),
              lastFetchError: null,
              lastFetchErrorCode: null,
            });
          },
        }),
      ).filter((row) => row.date <= completedSessionDate);
      if (rows.length === 0) {
        throw new MarketDataError(
          "The provider has not returned a completed-session daily close.",
          503,
          "MARKET_DATA_UNAVAILABLE",
        );
      }
      const latest = rows.at(-1);
      if (!isWithinMaximumStaleAge(latest.date, completedSessionDate)) {
        throw new MarketDataError(
          "The provider has not returned a recent completed-session close.",
          503,
          "MARKET_DATA_UNAVAILABLE",
        );
      }
      if (cached && latest.date < cached.date) {
        const message =
          "The provider did not return a newer daily close; the cached close was retained.";
        await persistFetchStatus(symbol, {
          lastFetchError: message,
          lastFetchErrorCode: "MARKET_DATA_NOT_UPDATED",
        });
        console.warn(`Market data refresh did not advance ${symbol}: ${message}`);
        return cachedDailyResult(
          symbol,
          cached,
          { ...mapping, lastFetchError: message },
          new Date(),
          message,
        );
      }
      const record = await MarketDataCacheModel.findOneAndUpdate(
        { symbol },
        {
          $set: {
            symbol,
            providerSymbol: mapping.providerSymbol,
            companyName: mapping.companyName,
            ...latest,
            history: rows,
            fetchedAt: new Date(),
            source: SOURCE,
            isStale: latest.date < completedSessionDate,
          },
        },
        {
          returnDocument: "after",
          upsert: true,
          setDefaultsOnInsert: true,
        },
      ).lean();
      await persistFetchStatus(symbol, {
        lastFetchError: null,
        lastFetchErrorCode: null,
      });
      return {
        record,
        isStale: isRecordStale(record, new Date()),
        fetchError: null,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The market-data provider returned an unknown error.";
      const code =
        error instanceof MarketDataError
          ? error.code
          : "MARKET_DATA_PROVIDER_UNAVAILABLE";
      if (providerRequestStarted) {
        await persistFetchStatus(symbol, {
          lastFetchError: message,
          lastFetchErrorCode: code,
        });
      }
      logMarketDataUnavailable(symbol, error);
      const fallback = getUsableCachedRecord(
        await MarketDataCacheModel.findOne({ symbol }).lean(),
        new Date(),
      );
      if (fallback) {
        return cachedDailyResult(
          symbol,
          fallback,
          { ...mapping, lastFetchError: message },
          new Date(),
          message,
        );
      }
      throw error;
    } finally {
      dailyRequestsInFlight.delete(cacheKey);
    }
  })();

  dailyRequestsInFlight.set(cacheKey, request);
  return request;
};

const makeMarketHistory = (symbol, mapping, cached) => ({
  symbol,
  providerSymbol: mapping.providerSymbol,
  companyName: mapping.companyName,
  data: cached.record.history,
  source: cached.record.source || SOURCE,
  fetchedAt: cached.record.fetchedAt,
  isStale: cached.isStale,
  marketDataError: cached.fetchError || null,
});

const getMarketHistory = async (symbol) => {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.&_-]{1,30}$/.test(normalizedSymbol)) {
    throw new MarketDataError("A valid stock symbol is required.", 400, "INVALID_SYMBOL");
  }

  if (
    !canRefreshDailyData() &&
    !KNOWN_SYMBOLS.some((known) => known.symbol === normalizedSymbol)
  ) {
    const persistedMapping = await MarketSymbolMappingModel.findOne({
      $or: [
        { symbol: normalizedSymbol },
        { providerSymbol: normalizedSymbol },
      ],
    }).lean();
    if (!persistedMapping) {
      throw new MarketDataError(
        "No cached provider mapping is available while the market is closed.",
        503,
        "MARKET_DATA_UNAVAILABLE",
      );
    }
  }

  const match = await resolveProviderSymbol(normalizedSymbol);
  const cached = await getDailySeries(match.symbol, match);
  return makeMarketHistory(normalizedSymbol, match, cached);
};

const getMarketQuote = async (symbol) => {
  const history = await getMarketHistory(symbol);
  const latest = history.data.at(-1);
  const previous = history.data.at(-2);
  const previousClose = previous?.close ?? null;
  const change =
    previousClose !== null ? latest.close - previousClose : null;
  const changePercent =
    previousClose !== null && previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  return {
    symbol: history.symbol,
    providerSymbol: history.providerSymbol,
    companyName: history.companyName,
    price: latest.close,
    previousClose,
    change,
    changePercent,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    volume: latest.volume,
    timestamp: latest.date,
    fetchedAt: history.fetchedAt,
    source: history.source,
    isStale: history.isStale,
    marketDataError: history.marketDataError,
  };
};

const getWatchlistSymbol = async (symbol) => {
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  if (!/^[A-Z0-9.&_-]{1,30}$/.test(normalizedSymbol)) {
    throw new MarketDataError("A valid stock symbol is required.", 400, "INVALID_SYMBOL");
  }

  const known = KNOWN_SYMBOLS.find(
    (entry) =>
      entry.symbol === normalizedSymbol ||
      entry.providerSymbol === normalizedSymbol,
  );
  if (known) {
    return known.symbol;
  }

  const mapping = await MarketSymbolMappingModel.findOne({
    $or: [
      { symbol: normalizedSymbol },
      { providerSymbol: normalizedSymbol },
    ],
  }).lean();
  if (!mapping?.providerSymbol) {
    throw new MarketDataError(
      "Choose a symbol with a confirmed market-data provider mapping.",
      400,
      "UNSUPPORTED_MARKET_SYMBOL",
    );
  }
  return mapping.symbol;
};

module.exports = {
  MarketDataError,
  getMarketHistory,
  getMarketQuote,
  getMarketDataRequestGroups,
  getWatchlistSymbol,
  searchMarketSymbols,
};
