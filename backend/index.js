require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");

const { HoldingsModel } = require("./model/HoldingsModel");
const { OrdersModel } = require("./model/OrdersModel");
const { PositionsModel } = require("./model/PositionsModel");
const { UserModel } = require("./model/UserModel");
const { StockModel } = require("./model/StockModel");
const { FundsModel } = require("./model/FundsModel");
const { UserWatchlistEntryModel } = require("./model/UserWatchlistEntryModel");
const { requireAuth } = require("./middleware/auth");
const { createWatchlistRouter } = require("./routes/watchlist");
const { PAPER_STARTING_CASH } = require("./config");
const {
  MarketDataError,
  getMarketHistory,
  getMarketQuote,
  getWatchlistSymbol,
  searchMarketSymbols,
} = require("./services/marketDataService");
const { summarizePortfolio } = require("./services/portfolioSummary");
const { logMarketDataUnavailable } = require("./services/marketDataLogging");

const PORT = Number(process.env.PORT) || 3002;
const uri = process.env.MONGO_URL;
const jwtSecret = process.env.JWT_SECRET;
const frontendUrl = process.env.FRONTEND_URL;
const dashboardUrl = process.env.DASHBOARD_URL;
const nodeEnvironment = process.env.NODE_ENV || "development";
const cookieSecure = process.env.SESSION_COOKIE_SECURE === "true";
const cookieSameSite =
  process.env.SESSION_COOKIE_SAME_SITE ||
  (nodeEnvironment === "production" ? "" : "lax");
const cookieMaxAge = Number(
  process.env.SESSION_COOKIE_MAX_AGE_MS || 60 * 60 * 1000,
);

const validateOrigin = (value, name) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid origin URL`);
  }

  if (
    !/^https?:$/.test(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `${name} must be an origin URL without a path or credentials`,
    );
  }
  if (nodeEnvironment === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  return url.origin;
};

if (
  !uri ||
  !jwtSecret ||
  (nodeEnvironment === "production" && jwtSecret.length < 32)
) {
  throw new Error("MONGO_URL and a strong JWT_SECRET are required");
}
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const allowedOrigins = new Set([
  validateOrigin(frontendUrl, "FRONTEND_URL"),
  validateOrigin(dashboardUrl, "DASHBOARD_URL"),
]);

if (!Number.isInteger(cookieMaxAge) || cookieMaxAge <= 0) {
  throw new Error("SESSION_COOKIE_MAX_AGE_MS must be a positive integer");
}
if (!["lax", "strict", "none"].includes(cookieSameSite)) {
  throw new Error(
    "SESSION_COOKIE_SAME_SITE must be explicitly set to lax, strict, or none",
  );
}
if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error("SameSite=None requires SESSION_COOKIE_SECURE=true");
}
if (nodeEnvironment === "production" && !cookieSecure) {
  throw new Error("SESSION_COOKIE_SECURE=true is required in production");
}

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: cookieSameSite,
  secure: cookieSecure,
  path: "/",
  maxAge: cookieMaxAge,
};

const app = express();
app.set("trust proxy", 1);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed"));
    },
    credentials: true,
  }),
);
app.use(bodyParser.json({ limit: "100kb" }));
app.get("/health", (_req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  return res
    .status(databaseReady ? 200 : 503)
    .json({ status: databaseReady ? "ok" : "unavailable" });
});
app.use(
  createWatchlistRouter({
    requireAuth,
    getWatchlistSymbol,
    UserWatchlistEntryModel,
  }),
);

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts. Please try again later.",
  },
});

const createToken = (user) =>
  jwt.sign({ userId: user._id.toString(), email: user.email }, jwtSecret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
});

const getOrCreateFunds = (userId, session) =>
  FundsModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { balance: PAPER_STARTING_CASH } },
    { returnDocument: "after", upsert: true, session },
  );

const getPortfolioRows = async (model, userId) => {
  const records = await model.find({ userId }).lean();
  const symbols = [...new Set(records.map((record) => record.name))];
  const quotes = new Map();
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        quotes.set(symbol, await getMarketQuote(symbol));
      } catch (error) {
        logMarketDataUnavailable(symbol, error);
      }
    }),
  );

  return records.map((record) => {
    const quote = quotes.get(record.name);
    const price = Number.isFinite(quote?.price) ? quote.price : null;
    const quantity = Number.isFinite(record.qty) ? record.qty : null;
    const averageCost = Number.isFinite(record.avg) ? record.avg : null;
    const currentValue =
      price !== null && quantity !== null ? price * quantity : null;
    const costValue =
      averageCost !== null && quantity !== null
        ? averageCost * quantity
        : null;
    const unrealizedPnL =
      currentValue !== null && costValue !== null
        ? currentValue - costValue
        : null;
    const dayChangePercent = Number.isFinite(quote?.changePercent)
      ? quote.changePercent
      : null;
    const dayChange =
      price !== null && quantity !== null && Number.isFinite(quote?.change)
        ? quantity * quote.change
        : null;

    return {
      ...record,
      price,
      currentValue,
      costValue,
      unrealizedPnL,
      netChangePercent:
        unrealizedPnL !== null && costValue > 0
          ? (unrealizedPnL / costValue) * 100
          : null,
      dayChange,
      dayChangePercent: Number.isFinite(dayChangePercent)
        ? dayChangePercent
        : null,
      isLoss: dayChange !== null ? dayChange < 0 : null,
      marketDataUnavailable: !quote,
      marketDataIsStale: quote?.isStale ?? false,
    };
  });
};

const respondWithMarketDataError = (res, error) => {
  if (error instanceof MarketDataError) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
    });
  }

  console.error("Unexpected market-data error", error);
  return res.status(502).json({
    code: "MARKET_DATA_UNAVAILABLE",
    message: "Market data is temporarily unavailable. Please try again later.",
  });
};

const setSessionCookie = (response, user) => {
  response.cookie(
    "equityflow_session",
    createToken(user),
    sessionCookieOptions,
  );
};

const updatePortfolioRecord = async (
  model,
  userId,
  symbol,
  type,
  quantity,
  price,
  session,
  fields = {},
) => {
  const record = await model
    .findOne({
      userId,
      name: symbol,
    })
    .session(session);

  if (type === "SELL" && (!record || record.qty < quantity)) {
    throw new Error(
      `Insufficient ${model === HoldingsModel ? "holding" : "position"} quantity`,
    );
  }

  if (!record) {
    return model
      .create(
        [
          {
            userId,
            name: symbol,
            qty: quantity,
            avg: price,
            price,
            ...fields,
          },
        ],
        { session },
      )
      .then(([created]) => created);
  }

  if (type === "BUY") {
    const totalQuantity = record.qty + quantity;
    record.avg = (record.avg * record.qty + price * quantity) / totalQuantity;
    record.qty = totalQuantity;
  } else {
    record.qty -= quantity;
  }

  record.price = price;
  if (record.qty === 0) {
    await model.deleteOne({ _id: record._id }).session(session);
    return null;
  }

  await record.save({ session });
  return record;
};

app.post("/auth/register", authRateLimit, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        message:
          "Name, email, and a password of at least 8 characters are required",
      });
    }

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "An account with that email already exists" });
    }

    const user = await UserModel.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });
    await FundsModel.create({
      userId: user._id,
      balance: PAPER_STARTING_CASH,
    });

    setSessionCookie(res, user);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create account" });
  }
});

app.post("/auth/login", authRateLimit, async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const user = await UserModel.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    setSessionCookie(res, user);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return res.status(500).json({ message: "Unable to log in" });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("equityflow_session", sessionCookieOptions);
  return res.status(204).end();
});

app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.userId);

    if (!user) {
      return res.status(401).json({ message: "User account not found" });
    }

    return res.json({ user: publicUser(user) });
  } catch (error) {
    return res.status(401).json({ message: "Unable to verify session" });
  }
});

app.get("/watchlist", requireAuth, async (req, res) => {
  try {
    const [defaultStocks, preferences] = await Promise.all([
      StockModel.find({}, { symbol: 1 }).sort({ symbol: 1 }).lean(),
      UserWatchlistEntryModel.find({ userId: req.user.userId }).lean(),
    ]);
    const preferencesBySymbol = new Map(
      preferences.map((preference) => [preference.symbol, preference]),
    );
    const defaultSymbols = new Set(defaultStocks.map((stock) => stock.symbol));
    const stocks = [
      ...defaultStocks.filter(
        (stock) => preferencesBySymbol.get(stock.symbol)?.included !== false,
      ),
      ...preferences
        .filter(
          (preference) =>
            preference.included && !defaultSymbols.has(preference.symbol),
        )
        .map((preference) => ({ symbol: preference.symbol })),
    ].sort((first, second) => first.symbol.localeCompare(second.symbol));
    const tradableSymbols = new Set(
      defaultStocks.map((stock) => stock.symbol),
    );
    const quotes = await Promise.all(
      stocks.map(async (stock) => {
        try {
          const quote = await getMarketQuote(stock.symbol);
          const changePercent = quote.changePercent;
          return {
            symbol: stock.symbol,
            companyName: quote.companyName,
            price: quote.price,
            percent: Number.isFinite(changePercent)
              ? `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`
              : "—",
            isDown: Number.isFinite(changePercent) && changePercent < 0,
            timestamp: quote.timestamp,
            source: quote.source,
            isStale: quote.isStale,
            canTrade: tradableSymbols.has(stock.symbol),
          };
        } catch (error) {
          logMarketDataUnavailable(stock.symbol, error);
          return {
            symbol: stock.symbol,
            price: null,
            percent: "—",
            isDown: false,
            canTrade: tradableSymbols.has(stock.symbol),
            isStale: true,
          };
        }
      }),
    );

    return res.json(quotes);
  } catch (error) {
    console.error("Unable to load watchlist market data", error);
    return res.status(500).json({ message: "Unable to load watchlist" });
  }
});

app.post("/watchlist", requireAuth, async (req, res) => {
  try {
    const symbol = await getWatchlistSymbol(req.body?.symbol);
    const [defaultStocks, preferences] = await Promise.all([
      StockModel.find({}, { symbol: 1 }).lean(),
      UserWatchlistEntryModel.find({ userId: req.user.userId }).lean(),
    ]);
    const preferencesBySymbol = new Map(
      preferences.map((preference) => [preference.symbol, preference]),
    );
    const defaultSymbols = new Set(defaultStocks.map((stock) => stock.symbol));
    const currentSymbols = new Set([
      ...defaultStocks
        .filter(
          (stock) => preferencesBySymbol.get(stock.symbol)?.included !== false,
        )
        .map((stock) => stock.symbol),
      ...preferences
        .filter(
          (preference) =>
            preference.included && !defaultSymbols.has(preference.symbol),
        )
        .map((preference) => preference.symbol),
    ]);
    if (!currentSymbols.has(symbol) && currentSymbols.size >= 50) {
      return res
        .status(400)
        .json({ message: "The watchlist can contain up to 50 symbols." });
    }

    await UserWatchlistEntryModel.findOneAndUpdate(
      { userId: req.user.userId, symbol },
      { $set: { included: true } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    return res.status(204).end();
  } catch (error) {
    return respondWithMarketDataError(res, error);
  }
});

app.get("/market/search", requireAuth, async (req, res) => {
  try {
    const matches = await searchMarketSymbols(req.query.keywords);
    return res.json({ matches });
  } catch (error) {
    return respondWithMarketDataError(res, error);
  }
});

app.get("/market/quote/:symbol", requireAuth, async (req, res) => {
  try {
    return res.json(await getMarketQuote(req.params.symbol));
  } catch (error) {
    return respondWithMarketDataError(res, error);
  }
});

app.get("/market/history/:symbol", requireAuth, async (req, res) => {
  try {
    return res.json(await getMarketHistory(req.params.symbol));
  } catch (error) {
    return respondWithMarketDataError(res, error);
  }
});

app.get("/funds", requireAuth, async (req, res) => {
  try {
    const funds = await getOrCreateFunds(req.user.userId);
    return res.json({ balance: funds.balance });
  } catch (error) {
    console.error("Unable to load virtual funds", error);
    return res.status(500).json({ message: "Unable to load virtual funds" });
  }
});

app.get("/portfolio", requireAuth, async (req, res) => {
  try {
    const [funds, holdings, positions] = await Promise.all([
      getOrCreateFunds(req.user.userId),
      getPortfolioRows(HoldingsModel, req.user.userId),
      getPortfolioRows(PositionsModel, req.user.userId),
    ]);
    return res.json({
      ...summarizePortfolio(holdings, positions, funds.balance),
      holdings: holdings.map(
        ({
          name,
          price,
          currentValue,
          marketDataUnavailable,
          marketDataIsStale,
        }) => ({
          name,
          price,
          currentValue,
          marketDataUnavailable,
          marketDataIsStale,
        }),
      ),
    });
  } catch (error) {
    console.error("Unable to load portfolio", error);
    return res.status(500).json({ message: "Unable to load portfolio" });
  }
});

app.post("/orders", requireAuth, async (req, res) => {
  try {
    const symbol = String(req.body.symbol || "")
      .trim()
      .toUpperCase();
    const type = String(req.body.type || "")
      .trim()
      .toUpperCase();
    const quantity = Number(req.body.quantity);
    const stock = await StockModel.findOne({ symbol }).lean();

    if (!stock) {
      return res.status(400).json({ message: "Stock not found" });
    }
    if (!["BUY", "SELL"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Transaction type must be BUY or SELL" });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "Quantity must be a positive number" });
    }

    let quote;
    try {
      quote = await getMarketQuote(symbol);
    } catch (error) {
      if (error instanceof MarketDataError) {
        return respondWithMarketDataError(res, error);
      }
      throw error;
    }
    const currentPrice = quote.price;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return res.status(503).json({
        message:
          "Market data is temporarily unavailable. The paper order was not placed.",
      });
    }

    const totalAmount = Number((quantity * currentPrice).toFixed(2));
    const session = await mongoose.startSession();
    let order;
    try {
      await session.withTransaction(async () => {
        await getOrCreateFunds(req.user.userId, session);

        if (type === "BUY") {
          const debit = await FundsModel.updateOne(
            { userId: req.user.userId, balance: { $gte: totalAmount } },
            { $inc: { balance: -totalAmount } },
            { session },
          );
          if (debit.matchedCount !== 1) {
            throw new Error("Insufficient funds");
          }
        }

        await updatePortfolioRecord(
          HoldingsModel,
          req.user.userId,
          symbol,
          type,
          quantity,
          currentPrice,
          session,
        );
        await updatePortfolioRecord(
          PositionsModel,
          req.user.userId,
          symbol,
          type,
          quantity,
          currentPrice,
          session,
          { product: "CNC" },
        );

        [order] = await OrdersModel.create(
          [
            {
              userId: req.user.userId,
              symbol,
              stockName: stock.symbol,
              type,
              quantity,
              price: currentPrice,
              totalAmount,
            },
          ],
          { session },
        );

        if (type === "SELL") {
          await FundsModel.updateOne(
            { userId: req.user.userId },
            { $inc: { balance: totalAmount } },
            { session },
          );
        }
      });
      return res.status(201).json({ order });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    if (error.message === "Insufficient funds") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message.startsWith("Insufficient")) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Unable to execute paper-trading order", error);
    return res.status(500).json({ message: "Unable to store order" });
  }
});

app.get("/orders", requireAuth, async (req, res) => {
  try {
    const orders = await OrdersModel.find({ userId: req.user.userId }).sort({
      createdAt: -1,
    });
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: "Unable to load orders" });
  }
});

app.get("/allHoldings", requireAuth, async (req, res) => {
  try {
    return res.json(await getPortfolioRows(HoldingsModel, req.user.userId));
  } catch (error) {
    console.error("Unable to load holdings", error);
    return res.status(500).json({ message: "Unable to load holdings" });
  }
});

app.get("/allPositions", requireAuth, async (req, res) => {
  try {
    return res.json(await getPortfolioRows(PositionsModel, req.user.userId));
  } catch (error) {
    console.error("Unable to load positions", error);
    return res.status(500).json({ message: "Unable to load positions" });
  }
});

app.use((error, req, res, next) => {
  if (error.message === "Origin is not allowed") {
    return res.status(403).json({ message: "Origin is not allowed" });
  }
  if (res.headersSent) {
    return next(error);
  }

  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
  if (status >= 500) {
    console.error("Unhandled request error");
  }
  return res.status(status).json({
    message:
      status === 413
        ? "Request body is too large"
        : status === 400
          ? "Invalid request"
          : "Internal server error",
  });
});

let server;
let shutdownStarted = false;

const shutdown = async (signal) => {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  console.info(`Received ${signal}; shutting down`);

  let forceCloseTimer;
  if (server) {
    forceCloseTimer = setTimeout(() => {
      console.error("HTTP server did not close in time; closing connections");
      server.closeAllConnections();
    }, 10_000);
    forceCloseTimer.unref();

    try {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    } catch {
      console.error("HTTP server shutdown failed");
      process.exitCode = 1;
    }
  }

  if (forceCloseTimer) {
    clearTimeout(forceCloseTimer);
  }
  try {
    await mongoose.disconnect();
  } catch {
    console.error("MongoDB shutdown failed");
    process.exitCode = 1;
  }
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
mongoose.connection.on("error", () => {
  console.error("MongoDB connection error");
});

const startServer = async () => {
  try {
    await mongoose.connect(uri);
    if (shutdownStarted) {
      return;
    }

    server = app.listen(PORT, () => {
      console.info(`HTTP server listening on port ${PORT}`);
    });
    server.on("error", () => {
      console.error("HTTP server failed to listen");
      process.exitCode = 1;
      void mongoose.disconnect();
    });
  } catch {
    console.error("Database connection failed");
    process.exitCode = 1;
    try {
      await mongoose.disconnect();
    } catch {
      console.error("MongoDB shutdown failed after startup error");
    }
  }
};

void startServer();
