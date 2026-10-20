const { Schema } = require("mongoose");

const StockSchema = new Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
  },
  { timestamps: true },
);

module.exports = { StockSchema };
