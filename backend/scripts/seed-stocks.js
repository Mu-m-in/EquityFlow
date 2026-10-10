require("dotenv").config();

const mongoose = require("mongoose");
const { StockModel } = require("../model/StockModel");
const { stocks } = require("../data/stocks");

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  try {
    for (const stock of stocks) {
      await StockModel.collection.updateOne(
        { symbol: stock.symbol },
        {
          $setOnInsert: stock,
          $unset: { price: "", percent: "", isDown: "" },
        },
        { upsert: true },
      );
    }
    console.log(`Seeded ${stocks.length} stocks`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
