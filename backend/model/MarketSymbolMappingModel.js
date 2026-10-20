const { model } = require("mongoose");

const { MarketSymbolMappingSchema } = require("../schemas/MarketSymbolMappingSchema");

const MarketSymbolMappingModel = model(
  "MarketSymbolMapping",
  MarketSymbolMappingSchema,
  "market_symbol_mappings",
);

module.exports = { MarketSymbolMappingModel };
