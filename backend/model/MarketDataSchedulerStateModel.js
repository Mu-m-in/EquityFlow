const { model } = require("mongoose");

const {
  MarketDataSchedulerStateSchema,
} = require("../schemas/MarketDataSchedulerStateSchema");

const MarketDataSchedulerStateModel = model(
  "MarketDataSchedulerState",
  MarketDataSchedulerStateSchema,
  "market_data_scheduler_state",
);

module.exports = { MarketDataSchedulerStateModel };
