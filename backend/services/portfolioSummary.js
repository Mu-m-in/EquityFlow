const sumKnownValues = (records, field) => {
  if (records.some((record) => !Number.isFinite(record[field]))) {
    return null;
  }
  return records.reduce((total, record) => total + record[field], 0);
};

const sumAvailableValues = (records, field) => {
  const values = records
    .map((record) => record[field])
    .filter(Number.isFinite);
  if (records.length > 0 && values.length === 0) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0);
};

const summarizePortfolio = (holdings, positions, availableCash) => {
  const totalInvestment = sumKnownValues(holdings, "costValue");
  const portfolioValue = sumAvailableValues(holdings, "currentValue");
  const unrealizedPnL = sumAvailableValues(holdings, "unrealizedPnL");
  const excludedHoldings = [
    ...new Set(
      holdings
        .filter(
          (holding) =>
            holding.marketDataUnavailable ||
            !Number.isFinite(holding.currentValue),
        )
        .map((holding) => holding.name),
    ),
  ];
  const marketDataUnavailableSymbols = [
    ...new Set(
      [...holdings, ...positions]
        .filter((record) => record.marketDataUnavailable)
        .map((record) => record.name),
    ),
  ];
  const hasUnavailablePrices = excludedHoldings.length > 0;

  return {
    holdingsCount: holdings.length,
    positionsCount: positions.length,
    marketDataUnavailable: marketDataUnavailableSymbols.length > 0,
    marketDataUnavailableSymbols,
    marketDataIsStale:
      holdings.some((holding) => holding.marketDataIsStale) ||
      positions.some((position) => position.marketDataIsStale),
    excludedHoldings,
    portfolioValueIsPartial: hasUnavailablePrices,
    accountEquityIsPartial: hasUnavailablePrices,
    unrealizedPnLIsPartial: holdings.some(
      (holding) => !Number.isFinite(holding.unrealizedPnL),
    ),
    availableCash,
    totalInvestment,
    portfolioValue,
    unrealizedPnL,
    accountEquity:
      Number.isFinite(portfolioValue) && Number.isFinite(availableCash)
        ? availableCash + portfolioValue
        : null,
  };
};

module.exports = { summarizePortfolio };
