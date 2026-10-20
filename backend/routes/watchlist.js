const express = require("express");

const createWatchlistRouter = ({
  requireAuth,
  getWatchlistSymbol,
  UserWatchlistEntryModel,
}) => {
  const router = express.Router();

  router.delete("/watchlist/:symbol", requireAuth, async (req, res) => {
    try {
      const symbol = await getWatchlistSymbol(req.params.symbol);
      await UserWatchlistEntryModel.findOneAndUpdate(
        { userId: req.user.userId, symbol },
        { $set: { included: false } },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
      );
      return res.status(204).end();
    } catch (error) {
      if (Number.isInteger(error.statusCode) && error.code) {
        return res.status(error.statusCode).json({
          code: error.code,
          message: error.message,
        });
      }

      console.error(
        `Unable to remove ${req.params.symbol} from user ${req.user.userId}'s watchlist`,
        error,
      );
      return res.status(500).json({
        code: "WATCHLIST_REMOVE_FAILED",
        message: "Unable to update the watchlist. Please try again.",
      });
    }
  });

  return router;
};

module.exports = { createWatchlistRouter };
