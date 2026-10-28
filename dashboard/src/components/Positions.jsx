import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config.js";
import { formatMoney, formatPercent } from "../format.js";

const Positions = () => {
  const [positions, setPositions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get(`${API_URL}/allPositions`, { withCredentials: true })
      .then(({ data }) => setPositions(data))
      .catch(() => setError("Unable to load positions."))
      .finally(() => setIsLoading(false));
  }, []);

  const unavailableSymbols = [
    ...new Set(
      positions
        .filter((position) => position.marketDataUnavailable)
        .map((position) => position.name),
    ),
  ];

  return (
    <>
      <h3 className="page-title mb-6 text-xl font-normal text-slate-900">Positions</h3>
      {!isLoading &&
        (unavailableSymbols.length > 0 ||
          positions.some((position) => position.marketDataIsStale)) && (
        <p className="market-data-alert mb-4 text-sm text-amber-700">
          Showing the latest available cached daily closes for priced
          positions.{" "}
          {unavailableSymbols.length > 0 &&
            `Market data is unavailable for ${unavailableSymbols.join(", ")}.`}
        </p>
      )}
      {isLoading && (
        <p className="text-sm text-slate-500">Loading positions...</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isLoading && !error && positions.length === 0 && (
        <p className="text-sm text-slate-500">No open positions</p>
      )}
      {!isLoading && !error && positions.length > 0 && (
        <div className="table-scroll overflow-x-auto border border-slate-200 bg-white">
          <table className="data-table min-w-190 border-collapse text-sm text-slate-700">
            <thead className="bg-slate-50">
              <tr>
                {[
                  ["Product", "text-left"],
                  ["Instrument", "text-left"],
                  ["Qty.", "text-right"],
                  ["Avg.", "text-right"],
                  ["LTP", "text-right"],
                  ["P&L", "text-right"],
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
              {positions.map((position) => (
                <tr
                  key={position._id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-3">{position.product || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {position.name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatAmount(position.qty)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(position.avg)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(position.price)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      position.unrealizedPnL === null
                        ? "text-slate-500"
                        : position.unrealizedPnL >= 0
                          ? "text-emerald-600"
                          : "text-red-500"
                    }`}
                  >
                    {formatMoney(position.unrealizedPnL)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      position.isLoss === null
                        ? "text-slate-500"
                        : position.isLoss
                          ? "text-red-500"
                          : "text-emerald-600"
                    }`}
                  >
                    {formatMoney(position.dayChange)}{" "}
                    <span className="text-xs">
                      ({formatPercent(position.dayChangePercent)})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

const formatAmount = (value) =>
  Number.isFinite(value) ? new Intl.NumberFormat("en-IN").format(value) : "—";

export default Positions;
