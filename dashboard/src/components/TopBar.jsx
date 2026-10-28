import React from "react";

import logoUrl from "../../../frontend/public/logo-landing.svg";
import Menu from "./Menu.jsx";

const TopBar = ({ user, onLogout }) => {
  return (
    <header className="dashboard-topbar sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="dashboard-topbar-inner mx-auto flex h-16 items-center justify-between">
        <img
          src={logoUrl}
          alt="TradeHub"
          className="h-9 w-auto max-w-32 shrink-0 object-contain"
        />

        <Menu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
};

export default TopBar;
