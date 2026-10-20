const { Schema } = require("mongoose");

const DailyBarSchema = new Schema(
  {
    date: { type: String, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  { _id: false },
);

const MarketDataCacheSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    providerSymbol: { type: String, required: true, uppercase: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
    history: { type: [DailyBarSchema], required: true },
    fetchedAt: { type: Date, required: true },
    source: { type: String, required: true },
    isStale: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "market_data_cache" },
);

MarketDataCacheSchema.index({ fetchedAt: 1 });

module.exports = { MarketDataCacheSchema };
