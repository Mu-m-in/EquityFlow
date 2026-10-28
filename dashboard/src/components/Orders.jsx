import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API_URL } from "../config.js";
import { formatMoney } from "../format.js";

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get(`${API_URL}/orders`, { withCredentials: true })
      .then(({ data }) => setOrders(data))
      .catch(() => setError("Unable to load orders."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <h3 className="page-title mb-6 text-xl font-normal text-slate-900">
        Orders ({orders.length})
      </h3>
      {isLoading && <p className="text-sm text-slate-500">Loading orders...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isLoading && !error && orders.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-lg font-light text-slate-600">
            You haven't placed any orders
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-blue-600 px-6 py-2 text-sm text-white"
          >
            Get started
          </Link>
        </div>
      )}
      {!isLoading && !error && orders.length > 0 && (
        <div className="table-scroll overflow-x-auto border border-slate-200 bg-white">
          <table className="data-table min-w-[600px] border-collapse text-sm text-slate-700">
            <thead className="bg-slate-50">
              <tr>
                {[
                  ["Instrument", "text-left"],
                  ["Type", "text-left"],
                  ["Qty.", "text-right"],
                  ["Price", "text-right"],
                  ["Value", "text-right"],
                  ["Executed", "text-right"],
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
              {orders.map((order) => (
                <tr
                  key={order._id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-4 py-3">{order.symbol}</td>
                  <td
                    className={`px-4 py-3 ${
                      order.type === "BUY" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {order.type}
                  </td>
                  <td className="px-4 py-3 text-right">{order.quantity}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(order.price)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(order.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {new Date(order.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Orders;
