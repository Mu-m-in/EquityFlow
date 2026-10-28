import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grow,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  BarChartOutlined,
  DeleteOutlineOutlined,
  KeyboardArrowDown,
  KeyboardArrowUp,
} from "@mui/icons-material";
import { useLocation } from "react-router-dom";
import { API_URL } from "../config.js";

const WatchList = () => {
  const { pathname } = useLocation();
  const [watchlist, setWatchlist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [watchlistError, setWatchlistError] = useState("");
  const [watchlistActionError, setWatchlistActionError] = useState("");
  const [removingSymbols, setRemovingSymbols] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedHistoryStock, setSelectedHistoryStock] = useState(null);
  const [stockHistory, setStockHistory] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [transactionType, setTransactionType] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const historyRequestId = useRef(0);
  const watchlistRequestId = useRef(0);
  const removingSymbolsRef = useRef(new Set());

  const requestWatchlist = useCallback(
    () =>
      axios.get(`${API_URL}/watchlist`, {
        withCredentials: true,
      }),
    [],
  );

  const refreshWatchlist = useCallback(async () => {
    const { data } = await requestWatchlist();
    setWatchlist(data);
    setWatchlistError("");
  }, [requestWatchlist]);

  useEffect(() => {
    const requestId = ++watchlistRequestId.current;
    requestWatchlist()
      .then(({ data }) => {
        if (watchlistRequestId.current === requestId) {
          setWatchlist(data);
          setWatchlistError("");
        }
      })
      .catch(() => {
        if (watchlistRequestId.current === requestId) {
          setWatchlistError("Unable to load watchlist.");
        }
      })
      .finally(() => {
        if (watchlistRequestId.current === requestId) {
          setIsLoading(false);
        }
      });

    return () => {
      watchlistRequestId.current += 1;
    };
  }, [pathname, requestWatchlist]);

  useEffect(() => {
    const keywords = searchTerm.trim();
    if (keywords.length < 3) {
      return undefined;
    }

    let isCurrentSearch = true;
    const timeoutId = setTimeout(() => {
      setIsSearching(true);
      setSearchError("");
      axios
        .get(`${API_URL}/market/search`, {
          params: { keywords },
          withCredentials: true,
        })
        .then(({ data }) => {
          if (isCurrentSearch) {
            setSearchResults(data.matches);
          }
        })
        .catch(() => {
          if (isCurrentSearch) {
            setSearchResults([]);
            setSearchError("Search is temporarily unavailable. Try again later.");
          }
        })
        .finally(() => {
          if (isCurrentSearch) {
            setIsSearching(false);
          }
        });
    }, 500);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timeoutId);
    };
  }, [searchTerm]);

  const addWatchlistStock = async (symbol) => {
    setWatchlistActionError("");
    try {
      await axios.post(
        `${API_URL}/watchlist`,
        { symbol },
        { withCredentials: true },
      );
      await refreshWatchlist();
    } catch {
      setWatchlistActionError(
        "Unable to add that symbol. Choose a supported market symbol and try again.",
      );
    }
  };

  const removeWatchlistStock = async (symbol) => {
    if (removingSymbolsRef.current.has(symbol)) {
      return;
    }
    removingSymbolsRef.current.add(symbol);
    setRemovingSymbols(new Set(removingSymbolsRef.current));
    setWatchlistActionError("");
    try {
      await axios.delete(
        `${API_URL}/watchlist/${encodeURIComponent(symbol)}`,
        { withCredentials: true },
      );
      setWatchlist((current) =>
        current.filter((stock) => stock.symbol !== symbol),
      );
      try {
        await refreshWatchlist();
      } catch {
        setWatchlistError(
          "The symbol was removed, but the watchlist count could not be refreshed.",
        );
      }
    } catch {
      setWatchlistActionError("Unable to remove that symbol. Please try again.");
    } finally {
      removingSymbolsRef.current.delete(symbol);
      setRemovingSymbols(new Set(removingSymbolsRef.current));
    }
  };

  const openTransactionDialog = (stock, type) => {
    if (!Number.isFinite(stock.price)) {
      return;
    }
    setSelectedStock(stock);
    setTransactionType(type);
    setQuantity("");
    setTransactionError("");
  };

  const openHistoryDialog = async (stock) => {
    const requestId = ++historyRequestId.current;
    setSelectedHistoryStock(stock);
    setStockHistory(null);
    setHistoryError("");
    setIsHistoryLoading(true);

    try {
      const { data } = await axios.get(
        `${API_URL}/market/history/${encodeURIComponent(stock.symbol)}`,
        { withCredentials: true },
      );
      if (historyRequestId.current === requestId) {
        setStockHistory(data);
      }
    } catch (requestError) {
      if (historyRequestId.current === requestId) {
        setHistoryError(
          requestError.response?.data?.message ||
            "Market history is temporarily unavailable.",
        );
      }
    } finally {
      if (historyRequestId.current === requestId) {
        setIsHistoryLoading(false);
      }
    }
  };

  const closeHistoryDialog = () => {
    historyRequestId.current += 1;
    setSelectedHistoryStock(null);
    setStockHistory(null);
    setHistoryError("");
    setIsHistoryLoading(false);
  };

  const closeTransactionDialog = () => {
    setSelectedStock(null);
    setTransactionType(null);
    setQuantity("");
    setTransactionError("");
  };

  const handleTransaction = async (event) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);

    if (
      !selectedStock ||
      !Number.isFinite(selectedStock.price) ||
      !transactionType ||
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0
    ) {
      return;
    }

    setIsSubmitting(true);
    setTransactionError("");

    try {
      const { data } = await axios.post(
        `${API_URL}/orders`,
        {
          symbol: selectedStock.symbol,
          type: transactionType.toUpperCase(),
          quantity: parsedQuantity,
        },
        { withCredentials: true },
      );
      setSuccessMessage(
        `${data.order.type} executed: ${parsedQuantity} ${selectedStock.symbol} at ₹${Number(data.order.price).toFixed(2)} each (₹${Number(data.order.totalAmount).toFixed(2)} total).`,
      );
      closeTransactionDialog();
    } catch (requestError) {
      const marketDataCode = requestError.response?.data?.code;
      setTransactionError(
        marketDataCode?.startsWith("MARKET_DATA") ||
          marketDataCode === "UNSUPPORTED_MARKET_SYMBOL"
          ? "Market price is temporarily unavailable. Please try again later."
          : requestError.response?.data?.message ||
              "Unable to place the order. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedQuantity = Number(quantity);
  const totalAmount =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    Number.isFinite(selectedStock?.price)
      ? (parsedQuantity * selectedStock.price).toFixed(2)
      : "0.00";

  return (
    <div className="watchlist-panel h-full w-full border-r border-slate-200 bg-white pt-4 px-2">
      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <label htmlFor="search" className="sr-only">
          Search watchlist
        </label>

        <input
          type="text"
          id="search"
          placeholder="Search eg: infy, bse, nifty fut weekly, gold mcx"
          className="watchlist-search flex-1 rounded-full border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300"
          value={searchTerm}
          onChange={(event) => {
            const value = event.target.value;
            setSearchTerm(value);
            if (value.trim().length < 3) {
              setSearchResults([]);
              setSearchError("");
              setIsSearching(false);
            }
          }}
        />

        <span className="text-sm text-slate-500 whitespace-nowrap">
          {isLoading ? "..." : `${watchlist.length} / 50`}
        </span>
      </div>

      {searchTerm.trim().length >= 3 && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white">
          {isSearching && (
            <p className="px-4 py-3 text-sm text-slate-500">
              Searching market symbols...
            </p>
          )}
          {searchError && (
            <p className="px-4 py-3 text-sm text-red-600">{searchError}</p>
          )}
          {!isSearching && !searchError && searchResults.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">
              No matching symbols
            </p>
          )}
          {searchResults.map((match) => (
            <div
              key={`${match.symbol}-${match.region}`}
              className="flex min-w-0 items-center gap-2 border-b border-slate-100 px-3 py-3 last:border-0 hover:bg-slate-50"
            >
              <button
                type="button"
                onClick={() => openHistoryDialog(match)}
                className="min-w-0 flex-1 truncate text-left"
              >
                <span className="block truncate text-sm font-medium text-slate-800">
                  {match.symbol}
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {match.companyName}
                  {match.region ? ` · ${match.region}` : ""}
                </span>
              </button>
              <Button
                size="small"
                onClick={() => addWatchlistStock(match.symbol)}
                disabled={watchlist.some(
                  (stock) => stock.symbol === match.symbol,
                ) || watchlist.length >= 50}
                aria-label={`Add ${match.symbol} to watchlist`}
              >
                {watchlist.some((stock) => stock.symbol === match.symbol)
                  ? "Added"
                  : watchlist.length >= 50
                    ? "Full"
                    : "Add"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Watchlist Items */}
      <ul className="watchlist-list mt-4">
        {watchlist.map((stock) => (
          <WatchListItem
            stock={stock}
            key={stock._id || stock.symbol}
            onTransaction={openTransactionDialog}
            onHistory={openHistoryDialog}
            onRemove={removeWatchlistStock}
            isRemoving={removingSymbols.has(stock.symbol)}
          />
        ))}
      </ul>

      {watchlistError && (
        <Alert severity="error" className="mt-4">
          {watchlistError}
        </Alert>
      )}
      {watchlistActionError && (
        <Alert severity="warning" className="mt-4">
          {watchlistActionError}
        </Alert>
      )}
      {!isLoading && !watchlistError && watchlist.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No watchlist stocks</p>
      )}

      {successMessage && (
        <Alert
          severity="success"
          onClose={() => setSuccessMessage("")}
          className="mt-4"
        >
          {successMessage}
        </Alert>
      )}

      <Dialog
        open={Boolean(selectedStock)}
        onClose={isSubmitting ? undefined : closeTransactionDialog}
        fullWidth
        maxWidth="xs"
      >
        <form onSubmit={handleTransaction}>
          <DialogTitle>
            {transactionType} {selectedStock?.symbol}
          </DialogTitle>
          <DialogContent>
            <p className="mb-4 text-sm text-slate-600">
              Latest available price (last close): {selectedStock?.price ?? "—"}
            </p>
            <p className="mb-1 text-sm font-medium text-slate-700">
              Estimated order value: ₹{totalAmount}
            </p>
            <p className="mb-4 text-xs text-slate-500">
              Final price is set by the backend when the paper order executes.
            </p>
            <TextField
              autoFocus
              fullWidth
              required
              type="number"
              label={`How many do you want to ${transactionType?.toLowerCase()}?`}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputProps={{ min: 0.0001, step: "any" }}
              error={
                quantity !== "" &&
                (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)
              }
              helperText={
                quantity !== "" &&
                (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0)
                  ? "Enter a positive number"
                  : ""
              }
            />
            {transactionError && (
              <Alert severity="error" className="mt-4">
                {transactionError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeTransactionDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                isSubmitting ||
                !quantity ||
                !Number.isFinite(parsedQuantity) ||
                parsedQuantity <= 0
              }
            >
              {isSubmitting ? `${transactionType}ing...` : transactionType}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(selectedHistoryStock)}
        onClose={closeHistoryDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {selectedHistoryStock?.symbol}{" "}
          {stockHistory?.companyName ? `· ${stockHistory.companyName}` : ""}
        </DialogTitle>
        <DialogContent>
          <p className="mb-4 text-xs text-slate-500">
            Daily OHLCV · latest available data, not real-time
          </p>
          {isHistoryLoading && (
            <p className="text-sm text-slate-500">Loading market history...</p>
          )}
          {historyError && (
            <Alert severity="warning" className="mb-4">
              Market history is temporarily unavailable. Please try again later.
            </Alert>
          )}
          {stockHistory?.isStale && (
            <Alert severity="warning" className="mb-4">
              Showing the last available market history.
            </Alert>
          )}
          {stockHistory?.data?.length > 0 && (
            <>
              <svg
                viewBox="0 0 600 180"
                role="img"
                aria-label={`${selectedHistoryStock?.symbol} daily closing prices`}
                className="history-chart h-44 w-full rounded-lg bg-slate-50"
              >
                <polyline
                  points={getChartPoints(stockHistory.data)}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="history-range-labels mb-4 mt-2 flex justify-between text-xs text-slate-500">
                <span>{stockHistory.data[0].date}</span>
                <span>
                  Last close:{" "}
                  {stockHistory.data[stockHistory.data.length - 1].close}
                </span>
                <span>
                  {stockHistory.data[stockHistory.data.length - 1].date}
                </span>
              </div>
              <div className="history-table-scroll overflow-x-auto">
                <table className="history-table w-full border-collapse text-xs text-slate-700">
                  <thead className="bg-slate-50">
                    <tr>
                      {["Date", "Open", "High", "Low", "Close", "Volume"].map(
                        (label) => (
                          <th
                            key={label}
                            className="border-b border-slate-200 px-3 py-2 text-right font-medium text-slate-500 first:text-left"
                          >
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {stockHistory.data
                      .slice(-5)
                      .reverse()
                      .map((day) => (
                        <tr
                          key={day.date}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="px-3 py-2">{day.date}</td>
                          {[day.open, day.high, day.low, day.close, day.volume].map(
                            (value, index) => (
                              <td
                                key={`${day.date}-${index}`}
                                className="px-3 py-2 text-right"
                              >
                                {value}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeHistoryDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default WatchList;

const getChartPoints = (rows) => {
  const closes = rows.map((row) => row.close);
  const minimum = Math.min(...closes);
  const range = Math.max(...closes) - minimum || 1;
  const lastIndex = Math.max(rows.length - 1, 1);

  return rows
    .map((row, index) => {
      const x = rows.length === 1 ? 300 : 8 + (index / lastIndex) * 584;
      const y = 172 - ((row.close - minimum) / range) * 164;
      return `${x},${y}`;
    })
    .join(" ");
};

const WatchListItem = ({
  stock,
  onTransaction,
  onHistory,
  onRemove,
  isRemoving,
}) => {
  return (
    <li
      className="watchlist-row border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-all duration-200"
    >
      <div className="grid grid-cols-[minmax(3.5rem,1fr)_4.5rem_minmax(8rem,1.2fr)] items-center gap-1 py-3 px-2">
        {/* Stock Name */}
        <p
          className={`font-medium text-sm ${
            stock.isDown ? "text-red-500" : "text-green-500"
          } min-w-0 truncate`}
          title={stock.symbol}
        >
          {stock.symbol}
        </p>

        {/* Percentage + Arrow */}
        <div className="flex min-w-18 items-center justify-center gap-0.5 whitespace-nowrap">
          <span
            className={`text-sm font-medium ${
              stock.isDown ? "text-red-500" : "text-green-500"
            }`}
          >
            {Number.isFinite(stock.price) ? stock.percent : "—"}
          </span>

          {!Number.isFinite(stock.price) ? null : stock.isDown ? (
            <KeyboardArrowDown className="text-lg! text-red-500" />
          ) : (
            <KeyboardArrowUp className="text-lg! text-green-500" />
          )}
        </div>

        {/* Price */}
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-1">
            <span className="text-sm font-medium text-slate-700">
              {Number.isFinite(stock.price) ? stock.price.toFixed(2) : "—"}
            </span>
            {stock.isStale && Number.isFinite(stock.price) && (
              <span className="text-[9px] text-amber-700">Delayed</span>
            )}
          </div>
          {stock.timestamp && (
            <span
              className="block max-w-full truncate whitespace-nowrap text-[10px] text-slate-500"
              title={`Last close · ${stock.timestamp}`}
            >
              Last close · {formatMarketDate(stock.timestamp)}
            </span>
          )}
          {!Number.isFinite(stock.price) && (
            <span
              className="block truncate text-[9px] text-slate-500"
              title="Price temporarily unavailable"
            >
              Price temporarily unavailable
            </span>
          )}
        </div>
      </div>
      <WatchListActions
        stock={stock}
        onTransaction={onTransaction}
        onHistory={onHistory}
        onRemove={onRemove}
        isRemoving={isRemoving}
      />
    </li>
  );
};

const WatchListActions = ({
  stock,
  onTransaction,
  onHistory,
  onRemove,
  isRemoving,
}) => {
  return (
    <div className="watchlist-item-actions flex items-center gap-2 py-2 px-2">
      <Tooltip title="Buy (B)" placement="top" arrow TransitionComponent={Grow}>
        <button
          type="button"
          className="p-1 hover:bg-slate-100 rounded transition"
          onClick={() => onTransaction(stock, "Buy")}
          disabled={!stock.canTrade || !Number.isFinite(stock.price)}
        >
          Buy
        </button>
      </Tooltip>
      <Tooltip
        title="Sell (S)"
        placement="top"
        arrow
        TransitionComponent={Grow}
      >
        <button
          type="button"
          className="p-1 hover:bg-slate-100 rounded transition"
          onClick={() => onTransaction(stock, "Sell")}
          disabled={!stock.canTrade || !Number.isFinite(stock.price)}
        >
          Sell
        </button>
      </Tooltip>
      <Tooltip
        title="Analytics (A)"
        placement="top"
        arrow
        TransitionComponent={Grow}
      >
        <button
          type="button"
          className="p-1 hover:bg-slate-100 rounded transition"
          onClick={() => onHistory(stock)}
        >
          <BarChartOutlined className="text-sm" />
        </button>
      </Tooltip>
      <Tooltip
        title="Remove from watchlist"
        placement="top"
        arrow
        TransitionComponent={Grow}
      >
        <button
          type="button"
          className="p-1 hover:bg-slate-100 rounded transition"
          onClick={() => onRemove(stock.symbol)}
          disabled={isRemoving}
          aria-label={`Remove ${stock.symbol} from watchlist`}
        >
          <DeleteOutlineOutlined className="text-sm" />
        </button>
      </Tooltip>
    </div>
  );
};

const formatMarketDate = (date) => {
  const [year, month, day] = String(date).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) {
    return date;
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};
