const { model } = require("mongoose");

const { AlphaVantageQuotaSchema } = require("../schemas/AlphaVantageQuotaSchema");

const AlphaVantageQuotaModel = model(
  "AlphaVantageQuota",
  AlphaVantageQuotaSchema,
  "alpha_vantage_quotas",
);

module.exports = { AlphaVantageQuotaModel };
