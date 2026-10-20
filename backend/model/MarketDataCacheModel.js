const { model } = require("mongoose");

const { MarketDataCacheSchema } = require("../schemas/MarketDataCacheSchema");

const MarketDataCacheModel = model(
  "MarketDataCache",
  MarketDataCacheSchema,
  "market_data_cache",
);

module.exports = { MarketDataCacheModel };
