import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config.js";
import { formatMoney, formatPercent } from "../format.js";

const Holdings = () => {
  const [holdings, setHoldings] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      axios.get(`${API_URL}/allHoldings`, { withCredentials: true }),
      axios.get(`${API_URL}/portfolio`, { withCredentials: true }),
    ])
      .then(([holdingsResponse, portfolioResponse]) => {
        setHoldings(holdingsResponse.data);
        setPortfolio(portfolioResponse.data);
      })
      .catch(() => setError("Unable to load holdings."))
      .finally(() => setIsLoading(false));
  }, []);

  const unavailableSymbols = [
    ...new Set(
      holdings
        .filter((holding) => holding.marketDataUnavailable)
        .map((holding) => holding.name),
    ),
  ];

  return (
    <>
      <h3 className="page-title mb-6 text-xl font-normal text-slate-900">
        Holdings ({portfolio?.holdingsCount ?? "—"})
      </h3>
      {!isLoading &&
        (unavailableSymbols.length > 0 ||
          holdings.some((holding) => holding.marketDataIsStale)) && (
        <p className="market-data-alert mb-4 text-sm text-amber-700">
          Showing the latest available cached daily closes for priced
          holdings.{" "}
          {unavailableSymbols.length > 0 &&
            `Market data is unavailable for ${unavailableSymbols.join(", ")}. Aggregate values below exclude these holdings and are partial.`}
        </p>
      )}
      {isLoading && (
        <p className="text-sm text-slate-500">Loading holdings...</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isLoading && !error && holdings.length === 0 && (
        <p className="text-sm text-slate-500">No holdings</p>
      )}
      {!isLoading && !error && holdings.length > 0 && (
        <div className="table-scroll overflow-x-auto border border-slate-200 bg-white">
          <table className="data-table min-w-225 border-collapse text-sm text-slate-700">
            <thead className="bg-slate-50">
              <tr>
                {[
                  ["Instrument", "text-left"],
                  ["Qty.", "text-right"],
                  ["Avg. cost", "text-right"],
                  ["LTP", "text-right"],
                  ["Cur. val", "text-right"],
                  ["P&L", "text-right"],
                  ["Net chg.", "text-right"],
                  ["Day chg.", "text-right"],
                ].map(([label, alignment]) => (
                  <th
                    key={label}
                    className={`border-b border-slate-200 px-4 py-3 ${alignment} text-slate-500`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => {
                const isProfit =
                  holding.unrealizedPnL !== null &&
                  holding.unrealizedPnL >= 0;

                return (
                  <tr
                    key={holding._id}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {holding.name}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatAmount(holding.qty)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(holding.avg)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(holding.price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatMoney(holding.currentValue)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        holding.unrealizedPnL === null
                          ? "text-slate-500"
                          : isProfit
                            ? "text-emerald-600"
                            : "text-red-500"
                      }`}
                    >
                      {formatMoney(holding.unrealizedPnL)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatPercent(holding.netChangePercent)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        holding.isLoss === null
                          ? "text-slate-500"
                          : holding.isLoss
                            ? "text-red-500"
                            : "text-emerald-600"
                      }`}
                    >
                      {formatMoney(holding.dayChange)}{" "}
                      <span className="text-xs">
                        ({formatPercent(holding.dayChangePercent)})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && portfolio && (
        <div className="metric-summary-grid mt-6 grid gap-5">
          <Metric label="Total investment" value={portfolio.totalInvestment} />
          <Metric
            label={`Current value${portfolio.portfolioValueIsPartial ? " (partial)" : ""}`}
            value={portfolio.portfolioValue}
          />
          <Metric
            label={`Unrealized P&L${portfolio.unrealizedPnLIsPartial ? " (partial)" : ""}`}
            value={portfolio.unrealizedPnL}
            emphasize
          />
        </div>
      )}
    </>
  );
};

const Metric = ({ label, value, emphasize = false }) => (
  <div className="metric-card">
    <p
      className={`metric-value mt-0 text-2xl font-light ${
        emphasize && Number.isFinite(value)
          ? value >= 0
            ? "is-positive text-emerald-600"
            : "is-negative text-red-500"
          : "text-slate-900"
      }`}
    >
      {formatMoney(value)}
    </p>
    <p className="metric-label mt-2 text-sm text-slate-500">{label}</p>
  </div>
);

const formatAmount = (value) =>
  Number.isFinite(value) ? new Intl.NumberFormat("en-IN").format(value) : "—";

export default Holdings;
