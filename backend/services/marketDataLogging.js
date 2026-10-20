const loggedErrors = new Map();

const logMarketDataUnavailable = (
  symbol,
  error,
  { logger = console, now = new Date() } = {},
) => {
  const isQuotaError =
    error.code === "MARKET_DATA_RATE_LIMITED" || error.statusCode === 429;
  const day = now.toISOString().slice(0, 10);
  const signature = isQuotaError
    ? error.code || "HTTP_429"
    : `${error.code || error.name}:${error.statusCode || ""}:${error.message}`;
  const key = `${symbol}:${signature}`;

  if (loggedErrors.get(key) === day) {
    return false;
  }
  loggedErrors.set(key, day);

  logger.warn(`Market data unavailable for ${symbol}: ${error.message}`);
  return true;
};

module.exports = { logMarketDataUnavailable };
