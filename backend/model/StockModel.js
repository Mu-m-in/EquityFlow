const { model } = require("mongoose");

const { StockSchema } = require("../schemas/StockSchema");

const StockModel = model("stock", StockSchema);

module.exports = { StockModel };
