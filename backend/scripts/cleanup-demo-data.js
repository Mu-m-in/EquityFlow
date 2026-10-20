require("dotenv").config();

const mongoose = require("mongoose");

const { HoldingsModel } = require("../model/HoldingsModel");
const { PositionsModel } = require("../model/PositionsModel");

const confirmationFlag = "--confirm-demo-cleanup";

const cleanupDemoRecords = async () => {
  if (!process.argv.includes(confirmationFlag)) {
    throw new Error(
      `Refusing to delete records without explicit confirmation. Run: npm run cleanup:demo -- ${confirmationFlag}`,
    );
  }
  if (!process.env.MONGO_URL) {
    throw new Error("MONGO_URL is required");
  }

  try {
    await mongoose.connect(process.env.MONGO_URL);

    const results = [];
    for (const [name, collection] of [
      ["holdings", HoldingsModel.collection],
      ["positions", PositionsModel.collection],
    ]) {
      const filter = { isDemo: true };
      const found = await collection.countDocuments(filter);
      const { deletedCount } = await collection.deleteMany(filter);
      results.push({ collection: name, found, removed: deletedCount });
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
};

cleanupDemoRecords().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});