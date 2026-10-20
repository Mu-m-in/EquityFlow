const { Schema } = require("mongoose");

const AlphaVantageQuotaSchema = new Schema(
  {
    _id: { type: String },
    count: { type: Number, required: true, min: 0 },
    cooldownUntil: { type: Date },
  },
  { collection: "alpha_vantage_quotas", versionKey: false },
);

module.exports = { AlphaVantageQuotaSchema };
