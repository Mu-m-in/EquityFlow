const { model } = require("mongoose");

const { UserWatchlistEntrySchema } = require("../schemas/UserWatchlistEntrySchema");

const UserWatchlistEntryModel = model(
  "UserWatchlistEntry",
  UserWatchlistEntrySchema,
  "user_watchlist_entries",
);

module.exports = { UserWatchlistEntryModel };
