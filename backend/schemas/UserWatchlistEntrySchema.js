const { Schema } = require("mongoose");

const UserWatchlistEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: "user" },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    included: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "user_watchlist_entries" },
);

UserWatchlistEntrySchema.index({ userId: 1, symbol: 1 }, { unique: true });

module.exports = { UserWatchlistEntrySchema };
