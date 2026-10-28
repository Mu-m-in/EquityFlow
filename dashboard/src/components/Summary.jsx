import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config.js";
import { formatMoney } from "../format.js";

const Summary = ({ user }) => {
  const [portfolio, setPortfolio] = useState(null);
  const [allocationHoldings, setAllocationHoldings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [allocationError, setAllocationError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    const loadPortfolio = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/portfolio`, {
          withCredentials: true,
        });
        if (!isCurrent) {
          return;
        }
        setPortfolio(data);

        if (Array.isArray(data.holdings)) {
          setAllocationHoldings(data.holdings);
          return;
        }

        try {
          const { data: rows } = await axios.get(`${API_URL}/allHoldings`, {
            withCredentials: true,
          });
          if (!Array.isArray(rows)) {
            throw new Error("Invalid holdings response for portfolio allocation.");
          }
          if (isCurrent) {
            setAllocationHoldings(rows);
          }
        } catch {
          if (isCurrent) {
            setAllocationError(
              "Unable to load holdings for portfolio allocation.",
            );
          }
        }
      } catch {
        if (isCurrent) {
          setError("Unable to load portfolio summary.");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };

    loadPortfolio();
    return () => {
      isCurrent = false;
    };
  }, []);

  const unavailableSymbols = portfolio?.marketDataUnavailableSymbols || [];
  const excludedHoldings = portfolio?.excludedHoldings || [];
  const holdings = allocationHoldings || [];
  const pricedHoldings = holdings
    .filter(
      (holding) =>
        !holding.marketDataUnavailable &&
        Number.isFinite(holding.price) &&
        holding.price > 0 &&
        Number.isFinite(holding.currentValue) &&
        holding.currentValue >= 0,
    )
    .sort((first, second) => second.currentValue - first.currentValue);
  const excludedAllocationHoldings = holdings.filter(
    (holding) =>
      holding.marketDataUnavailable ||
      !Number.isFinite(holding.price) ||
      holding.price <= 0 ||
      !Number.isFinite(holding.currentValue) ||
      holding.currentValue < 0,
  );
  const allocationUnavailableSymbols = [
    ...new Set(
      excludedAllocationHoldings
        .filter(
          (holding) =>
            holding.marketDataUnavailable ||
            !Number.isFinite(holding.price) ||
            holding.price <= 0,
        )
        .map((holding) => holding.name),
    ),
  ];
  const allocationInvalidValueSymbols = [
    ...new Set(
      excludedAllocationHoldings
        .filter(
          (holding) =>
            Number.isFinite(holding.price) &&
            holding.price > 0 &&
            (!Number.isFinite(holding.currentValue) ||
              holding.currentValue < 0),
        )
        .map((holding) => holding.name),
    ),
  ];
  const pricedHoldingsValue = pricedHoldings.reduce(
    (total, holding) => total + holding.currentValue,
    0,
  );

  return (
    <>
      {isLoading && (
        <p className="text-sm text-slate-500">Loading summary...</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isLoading && !error && portfolio && (
        <>
          {(portfolio.marketDataUnavailable || portfolio.marketDataIsStale) && (
            <p className="market-data-alert mb-4 text-sm text-amber-700">
              Showing the latest available cached daily closes for priced
              symbols.{" "}
              {unavailableSymbols.length > 0 &&
                `Market data is unavailable for ${unavailableSymbols.join(", ")}. `}
              {excludedHoldings.length > 0 &&
                `Portfolio value, account equity, and P&L are partial; excluded holdings: ${excludedHoldings.join(", ")}.`}
            </p>
          )}
          <div className="summary-greeting mb-5 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h6 className="text-lg font-medium text-slate-900">
              Hi, {user?.name || user?.email || "there"}!
            </h6>
            <p className="mt-1 text-sm text-slate-500">
              Paper-trading account · virtual funds only
            </p>
          </div>

          <section className="summary-metrics grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <Metric
              label="Available virtual cash"
              value={portfolio.availableCash}
            />
            <Metric
              label={`Portfolio value${portfolio.portfolioValueIsPartial ? " (partial)" : ""}`}
              value={portfolio.portfolioValue}
            />
            <Metric
              label={`Account equity${portfolio.accountEquityIsPartial ? " (partial)" : ""}`}
              value={portfolio.accountEquity}
            />
            <Metric label="Total investment" value={portfolio.totalInvestment} />
            <Metric
              label={`Unrealized P&L${portfolio.unrealizedPnLIsPartial ? " (partial)" : ""}`}
              value={portfolio.unrealizedPnL}
              emphasize
            />
            <div className="metric-card rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="metric-label text-sm text-slate-500">Open holdings</p>
              <p className="metric-value mt-3 text-3xl font-light text-slate-900">
                {portfolio.holdingsCount}
              </p>
              <p className="metric-detail mt-4 text-sm text-slate-500">
                Open positions: {portfolio.positionsCount}
              </p>
            </div>
          </section>

          <section
            className="allocation-card mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
            aria-labelledby="portfolio-allocation-title"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2
                  id="portfolio-allocation-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Portfolio Allocation
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Based on the latest available prices
                </p>
              </div>
              {excludedAllocationHoldings.length > 0 && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Partial
                </span>
              )}
            </div>

            {pricedHoldings.length > 0 &&
            Number.isFinite(pricedHoldingsValue) &&
            pricedHoldingsValue > 0 ? (
              <div className="allocation-content">
                <div className="allocation-chart-wrap">
                  <svg
                    className="allocation-chart"
                    viewBox="0 0 200 200"
                    role="img"
                    aria-label={`Portfolio allocation of ${formatMoney(pricedHoldingsValue)} across ${pricedHoldings.length} priced holdings`}
                  >
                    <circle
                      cx="100"
                      cy="100"
                      r="72"
                      fill="none"
                      stroke="#edf1f7"
                      strokeWidth="24"
                    />
                    {pricedHoldings.reduce(
                      (segments, holding, index) => {
                        const circumference = 2 * Math.PI * 72;
                        const segmentLength =
                          (holding.currentValue / pricedHoldingsValue) *
                          circumference;
                        segments.items.push(
                          <circle
                            key={`${holding.name}-${index}`}
                            cx="100"
                            cy="100"
                            r="72"
                            fill="none"
                            stroke={
                              allocationColors[index % allocationColors.length]
                            }
                            strokeWidth="24"
                            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                            strokeDashoffset={-segments.offset}
                            transform="rotate(-90 100 100)"
                          />,
                        );
                        segments.offset += segmentLength;
                        return segments;
                      },
                      { items: [], offset: 0 },
                    ).items}
                  </svg>
                  <div className="allocation-chart-center" aria-hidden="true">
                    <span>Priced value</span>
                    <strong>{formatMoney(pricedHoldingsValue)}</strong>
                  </div>
                </div>

                <ul className="allocation-legend">
                  {pricedHoldings.map((holding, index) => (
                    <li
                      key={`${holding.name}-${index}`}
                      className="allocation-legend-item"
                    >
                      <span
                        className="allocation-legend-swatch"
                        style={{
                          backgroundColor:
                            allocationColors[index % allocationColors.length],
                        }}
                        aria-hidden="true"
                      />
                      <span className="allocation-legend-symbol">
                        {holding.name}
                      </span>
                      <span className="allocation-legend-value">
                        {formatMoney(holding.currentValue)}
                      </span>
                      <span className="allocation-legend-percent">
                        {(
                          (holding.currentValue / pricedHoldingsValue) *
                          100
                        ).toFixed(2)}
                        %
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : allocationError ? (
              <p className="rounded-xl bg-rose-50 px-4 py-6 text-sm text-rose-700">
                {allocationError}
              </p>
            ) : allocationHoldings === null ? (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Loading holdings for allocation...
              </p>
            ) : (
              <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {holdings.length === 0
                  ? "No holdings to allocate yet."
                  : "No holdings with an available price and positive total value to display."}
              </p>
            )}

            {excludedAllocationHoldings.length > 0 && (
              <p className="mt-4 text-sm text-amber-700">
                {allocationUnavailableSymbols.length > 0 &&
                  `Market data unavailable for ${allocationUnavailableSymbols.join(", ")}.`}
                {allocationInvalidValueSymbols.length > 0 &&
                  ` Excluded ${allocationInvalidValueSymbols.join(", ")} because the current market value is invalid.`}
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
};

const Metric = ({ label, value, emphasize = false }) => (
  <div className="metric-card rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
    <p className="metric-label text-sm text-slate-500">{label}</p>
    <p
      className={`metric-value mt-3 text-3xl font-light ${
        emphasize && Number.isFinite(value)
          ? value >= 0
            ? "is-positive text-emerald-600"
            : "is-negative text-red-500"
          : "text-slate-900"
      }`}
    >
      {formatMoney(value)}
    </p>
  </div>
);

const allocationColors = [
  "#2563eb",
  "#168456",
  "#60a5fa",
  "#34d399",
  "#64748b",
  "#1d4ed8",
  "#86a98f",
  "#94a3b8",
];

export default Summary;
