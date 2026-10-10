const { model } = require("mongoose");

const { FundsSchema } = require("../schemas/FundsSchema");

const FundsModel = model("funds", FundsSchema);

module.exports = { FundsModel };
