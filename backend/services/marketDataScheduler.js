const { randomUUID } = require("node:crypto");

const {
  getMarketHistory,
  getMarketDataRequestGroups,
  getProviderRequestBlock,
  getMarketDayKey,
  getIndiaMarketClock,
  getConfiguredMarketHolidays,
} = require("./marketDataService");
const { MarketDataSchedulerStateModel } = require("../model/MarketDataSchedulerStateModel");
const { StockModel } = require("../model/StockModel");
const { UserWatchlistEntryModel } = require("../model/UserWatchlistEntryModel");

const TIME_ZONE = "Asia/Kolkata";
const SCHEDULE_HOUR = 15;
const SCHEDULE_MINUTE = 45;
const SCHEDULE_STATE_ID = "market-close-refresh";
const LEASE_DURATION_MS = 2 * 60 * 1000;
const LEASE_RENEWAL_MS = 30 * 1000;
const LOCK_RETRY_MS = 60 * 1000;

const getInstantForLocalTime = (dateKey, hour, minute) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetWallTime;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .map(({ type, value }) => [type, value]),
    );
    const representedWallTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    timestamp += targetWallTime - representedWallTime;
  }
  return new Date(timestamp);
};

const getNextScheduledAt = (
  now = new Date(),
  holidays = getConfiguredMarketHolidays(),
  lastCompletedRunDate,
) => {
  const currentDate = getMarketDayKey(now);
  const currentDateValue = new Date(`${currentDate}T00:00:00.000Z`);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(currentDateValue);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const dateKey = candidate.toISOString().slice(0, 10);
    const weekday = candidate.getUTCDay();
    if (
      weekday === 0 ||
      weekday === 6 ||
      holidays.has(dateKey) ||
      dateKey === lastCompletedRunDate
    ) {
      continue;
    }

    const scheduledAt = getInstantForLocalTime(
      dateKey,
      SCHEDULE_HOUR,
      SCHEDULE_MINUTE,
    );
    if (dateKey === currentDate && scheduledAt <= now) {
      return new Date(now);
    }
    return scheduledAt;
  }

  throw new Error("Unable to find the next eligible market-data refresh date.");
};

const loadScheduledSymbols = async (stockModel, watchlistModel) => {
  const [stocks, watchlistEntries] = await Promise.all([
    stockModel.find({}, { symbol: 1 }).lean(),
    watchlistModel.find({ included: true }, { symbol: 1 }).lean(),
  ]);
  return [
    ...new Set(
      [...stocks, ...watchlistEntries]
        .map(({ symbol }) => symbol)
        .filter((symbol) => typeof symbol === "string" && symbol.length > 0),
    ),
  ].sort();
};

const createMarketDataScheduler = ({
  stateModel = MarketDataSchedulerStateModel,
  stockModel = StockModel,
  watchlistModel = UserWatchlistEntryModel,
  loadHistory = getMarketHistory,
  getRequestGroups = getMarketDataRequestGroups,
  getRequestBlock = getProviderRequestBlock,
  getNow = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  makeOwner = randomUUID,
  log = console,
} = {}) => {
  let started = false;
  let stopped = false;
  let timer;
  let activeRun;
  let stopRequested = false;

  const clearScheduledTimer = () => {
    if (timer) {
      clearTimeoutFn(timer);
      timer = null;
    }
  };

  const scheduleAfter = async (delayMs, allowBeforeClose = false) => {
    if (stopped || !started) {
      return;
    }
    clearScheduledTimer();
    timer = setTimeoutFn(() => {
      timer = null;
      void runScheduledRefresh({ allowBeforeClose }).then((result) => {
        if (stopped || !started) {
          return;
        }
        if (result.status === "busy") {
          void scheduleAfter(
            Math.max(
              LOCK_RETRY_MS,
              (result.leaseUntil?.getTime() || getNow().getTime()) -
                getNow().getTime() +
                1000,
            ),
            true,
          );
        } else if (result.status === "retry") {
          void scheduleAfter(LOCK_RETRY_MS, true);
        } else if (result.status === "deferred") {
          const retryAt =
            result.retryAt instanceof Date ? result.retryAt.getTime() : 0;
          void scheduleAfter(
            retryAt > getNow().getTime()
              ? retryAt - getNow().getTime() + 1000
              : LOCK_RETRY_MS,
            true,
          );
        } else {
          void scheduleNext();
        }
      });
    }, delayMs);
    timer.unref?.();
  };

  const scheduleNext = async () => {
    if (stopped || !started) {
      return;
    }
    try {
      const state = await stateModel.findOne({ _id: SCHEDULE_STATE_ID }).lean();
      const nextAt = getNextScheduledAt(
        getNow(),
        getConfiguredMarketHolidays(),
        state?.lastCompletedRunDate,
      );
      await scheduleAfter(Math.max(0, nextAt.getTime() - getNow().getTime()));
    } catch (error) {
      log.error("Unable to schedule market-data refresh", error);
      await scheduleAfter(LOCK_RETRY_MS);
    }
  };

  const initializeLeaseDocument = async () => {
    try {
      await stateModel.updateOne(
        { _id: SCHEDULE_STATE_ID },
        { $setOnInsert: { leaseUntil: new Date(0) } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code !== 11000) {
        throw error;
      }
    }
  };

  const acquireLease = async (runDate, owner, now) => {
    await initializeLeaseDocument();
    return stateModel
      .findOneAndUpdate(
        {
          _id: SCHEDULE_STATE_ID,
          leaseUntil: { $lte: now },
          lastCompletedRunDate: { $ne: runDate },
        },
        {
          $set: {
            leaseOwner: owner,
            leaseUntil: new Date(now.getTime() + LEASE_DURATION_MS),
          },
        },
        { returnDocument: "after" },
      )
      .lean();
  };

  const runScheduledRefresh = async ({ allowBeforeClose = false } = {}) => {
    if (stopped) {
      return { status: "skipped", reason: "stopped" };
    }
    if (activeRun) {
      return activeRun;
    }

    const runNow = getNow();
    let runDate;
    let weekday;
    let minutes;
    let holidays;
    try {
      runDate = getMarketDayKey(runNow);
      ({ weekday, minutes } = getIndiaMarketClock(runNow));
      holidays = getConfiguredMarketHolidays();
    } catch (error) {
      log.error("Unable to determine market-data scheduler calendar.", error);
      return { status: "retry", reason: "calendar-error" };
    }
    if (weekday === "Sat" || weekday === "Sun") {
      log.info(`Skipping market-data refresh on ${weekday} (${runDate}).`);
      return { status: "skipped", reason: "weekend" };
    }
    if (holidays.has(runDate)) {
      log.info(`Skipping market-data refresh on configured holiday ${runDate}.`);
      return { status: "skipped", reason: "holiday" };
    }
    if (!allowBeforeClose && minutes < SCHEDULE_HOUR * 60 + SCHEDULE_MINUTE) {
      log.info(`Market-data refresh is not due before 15:45 IST (${runDate}).`);
      return { status: "skipped", reason: "not-due" };
    }

    const runPromise = executeScheduledRefresh(runDate);
    activeRun = runPromise;
    try {
      return await runPromise;
    } finally {
      if (activeRun === runPromise) {
        activeRun = null;
      }
    }
  };

  const executeScheduledRefresh = async (runDate) => {
    const owner = makeOwner();
    let leaseAcquired = false;
    let completed = false;
    let leaseLost = false;
    let renewalPromise;
    let renewalTimer;
    let successful = 0;
    let failed = 0;
    let deferredResult;

    log.info(`Starting scheduled market-data refresh for ${runDate}.`);
    try {
      const lease = await acquireLease(runDate, owner, getNow());
      if (!lease) {
        const state = await stateModel.findOne({ _id: SCHEDULE_STATE_ID }).lean();
        if (state?.lastCompletedRunDate === runDate) {
          log.info(`Scheduled market-data refresh already completed for ${runDate}.`);
          return { status: "completed" };
        }
        log.info(
          `Market-data refresh lease is held by another backend instance until ${state?.leaseUntil || "unknown"}.`,
        );
        return { status: "busy", leaseUntil: state?.leaseUntil };
      }
      leaseAcquired = true;

      const renewLease = () => {
        if (renewalPromise || leaseLost) {
          return renewalPromise;
        }
        renewalPromise = (async () => {
          try {
            const result = await stateModel.updateOne(
              {
                _id: SCHEDULE_STATE_ID,
                leaseOwner: owner,
                leaseUntil: { $gt: getNow() },
              },
              {
                $set: {
                  leaseUntil: new Date(getNow().getTime() + LEASE_DURATION_MS),
                },
              },
            );
            if (result.matchedCount !== 1) {
              leaseLost = true;
              log.error(`Market-data refresh lease was lost for ${runDate}.`);
            }
          } catch (error) {
            leaseLost = true;
            log.error(`Unable to renew market-data refresh lease for ${runDate}.`, error);
          }
        })().finally(() => {
          renewalPromise = null;
        });
        return renewalPromise;
      };
      renewalTimer = setIntervalFn(() => void renewLease(), LEASE_RENEWAL_MS);
      renewalTimer.unref?.();

      const symbols = await loadScheduledSymbols(stockModel, watchlistModel);
      const groups = await getRequestGroups(symbols, getNow());
      const eligible = [...groups.uncached, ...groups.refreshable];
      log.info(
        `Eligible scheduled market-data symbols for ${runDate}: ${eligible.join(", ") || "none"}.`,
      );
      for (const symbol of groups.cached) {
        log.info(
          `Skipping ${symbol}: cached close matches the latest completed session.`,
        );
      }

      for (const symbol of eligible) {
        if (stopRequested || leaseLost) {
          break;
        }
        const requestBlock = await getRequestBlock(getNow());
        if (requestBlock) {
          log.warn(
            `Deferring scheduled refresh for ${requestBlock.code}; retry at ${requestBlock.retryAt || "the next retry interval"}.`,
          );
          deferredResult = {
            status: "deferred",
            reason: requestBlock.code,
            retryAt: requestBlock.retryAt,
          };
          break;
        }

        try {
          const result = await loadHistory(symbol);
          if (result.marketDataError || result.isStale) {
            failed += 1;
            log.warn(
              `Scheduled refresh did not produce a current close for ${symbol}: ${result.marketDataError || "returned stale data"}.`,
            );
          } else {
            successful += 1;
            log.info(`Refreshed ${symbol} for scheduled market-data run.`);
          }
        } catch (error) {
          failed += 1;
          if (
            error.code === "MARKET_DATA_DAILY_QUOTA_EXHAUSTED" ||
            error.code === "MARKET_DATA_RATE_LIMITED"
          ) {
            log.warn(
              `Deferring scheduled refresh after ${error.code} while processing ${symbol}; retry at ${error.retryAt || "the next retry interval"}.`,
            );
            deferredResult = {
              status: "deferred",
              reason: error.code,
              retryAt: error.retryAt,
            };
            break;
          }
          log.error(`Scheduled market-data refresh failed for ${symbol}.`, error);
        }
      }

      if (stopRequested || leaseLost) {
        return { status: "retry", reason: stopRequested ? "stopped" : "lease-lost" };
      }
      if (deferredResult) {
        return deferredResult;
      }

      if (renewalTimer) {
        clearIntervalFn(renewalTimer);
        renewalTimer = null;
      }
      if (renewalPromise) {
        await renewalPromise;
      }
      if (leaseLost) {
        return { status: "retry", reason: "lease-lost" };
      }

      const completion = await stateModel.updateOne(
        {
          _id: SCHEDULE_STATE_ID,
          leaseOwner: owner,
          leaseUntil: { $gt: getNow() },
        },
        {
          $set: {
            lastCompletedRunDate: runDate,
            leaseUntil: new Date(0),
          },
          $unset: { leaseOwner: 1 },
        },
      );
      if (completion.matchedCount !== 1) {
        leaseLost = true;
        return { status: "retry", reason: "lease-lost" };
      }
      completed = true;
      leaseAcquired = false;
      log.info(
        `Completed scheduled market-data refresh for ${runDate}: ${successful} refreshed, ${failed} failed.`,
      );
      return { status: "completed", successful, failed };
    } catch (error) {
      log.error(`Scheduled market-data refresh failed for ${runDate}.`, error);
      return { status: "retry", reason: "scheduler-error" };
    } finally {
      if (renewalTimer) {
        clearIntervalFn(renewalTimer);
      }
      if (renewalPromise) {
        await renewalPromise;
      }
      if (leaseAcquired && !completed) {
        try {
          await stateModel.updateOne(
            { _id: SCHEDULE_STATE_ID, leaseOwner: owner },
            {
              $set: { leaseUntil: new Date(0) },
              $unset: { leaseOwner: 1 },
            },
          );
        } catch (error) {
          log.error(`Unable to release market-data refresh lease for ${runDate}.`, error);
        }
      }
    }
  };

  return {
    start() {
      if (started || stopped) {
        return;
      }
      started = true;
      void scheduleNext();
    },
    async stop() {
      stopped = true;
      started = false;
      stopRequested = true;
      clearScheduledTimer();
      if (activeRun) {
        await activeRun;
      }
    },
    runScheduledRefresh,
  };
};

module.exports = {
  createMarketDataScheduler,
  getInstantForLocalTime,
  getNextScheduledAt,
  loadScheduledSymbols,
  SCHEDULE_HOUR,
  SCHEDULE_MINUTE,
};
