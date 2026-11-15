const { Schema } = require("mongoose");

const MarketDataSchedulerStateSchema = new Schema(
  {
    _id: { type: String },
    leaseOwner: { type: String },
    leaseUntil: { type: Date },
    lastCompletedRunDate: { type: String },
  },
  {
    collection: "market_data_scheduler_state",
    versionKey: false,
  },
);

module.exports = { MarketDataSchedulerStateSchema };
