const { Schema } = require("mongoose");

const MarketSymbolMappingSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    providerSymbol: { type: String, uppercase: true, trim: true },
    companyName: { type: String, trim: true },
    type: { type: String, default: null },
    region: { type: String, default: null },
    currency: { type: String, default: null },
    matchScore: { type: Number, default: 0 },
    searchQueries: { type: [String], default: [] },
    lastFetchAttemptAt: { type: Date, default: null },
    lastFetchError: { type: String, default: null },
    lastFetchErrorCode: { type: String, default: null },
  },
  { timestamps: true, collection: "market_symbol_mappings" },
);

MarketSymbolMappingSchema.index({ searchQueries: 1 });

module.exports = { MarketSymbolMappingSchema };
