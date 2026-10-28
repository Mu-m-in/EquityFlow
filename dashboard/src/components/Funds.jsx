import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../config.js";
import { formatMoney } from "../format.js";

const Funds = () => {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get(`${API_URL}/funds`, { withCredentials: true })
      .then(({ data }) => setBalance(data.balance))
      .catch(() => setError("Unable to load virtual funds."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <section className="funds-card max-w-2xl">
      <div className="funds-card-content">
        <h2 className="text-lg font-medium text-slate-900">
          Paper trading funds
        </h2>
        <p className="funds-description mt-1 text-sm text-slate-500">
          Virtual cash for simulated trades only. No bank or UPI transfers.
        </p>
        {isLoading && (
          <p className="mt-6 text-sm text-slate-500">Loading virtual cash...</p>
        )}
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        {!isLoading && !error && (
          <div className="funds-balance-panel mt-6">
            <p className="funds-balance-label">Available virtual cash</p>
            <p className="funds-balance-value mt-2">
              {formatMoney(balance)}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default Funds;
