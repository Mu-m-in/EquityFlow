import React from "react";
import { Route, Routes } from "react-router-dom";

import Funds from "./Funds.jsx";
import Holdings from "./Holdings.jsx";

import Orders from "./Orders.jsx";
import Positions from "./Positions.jsx";
import Summary from "./Summary.jsx";
import WatchList from "./WatchList.jsx";

const Dashboard = ({ user }) => {
  return (
    <main className="dashboard-layout mx-auto grid w-full gap-0 px-0 py-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
      <aside className="dashboard-watchlist-column order-2 min-w-0 space-y-6 lg:order-1">
        <WatchList />
      </aside>

      <section className="dashboard-content order-1 min-w-0 px-4 py-6 sm:px-8 lg:order-2">
        <Routes>
          <Route path="/" element={<Summary user={user} />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/holdings" element={<Holdings />} />
          <Route path="/positions" element={<Positions />} />
          <Route path="/funds" element={<Funds />} />
        </Routes>
      </section>
    </main>
  );
};

export default Dashboard;
