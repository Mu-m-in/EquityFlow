import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

const Menu = ({ user, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = user?.name || user?.email || "Account";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-4 lg:flex-none">
      <div className="flex items-center gap-4">
        <nav className="hidden items-center gap-6 text-sm text-slate-600 lg:flex">
          {["Dashboard", "Orders", "Holdings", "Positions", "Funds"].map(
            (item) => (
              <NavLink
                key={item}
                to={item === "Dashboard" ? "/" : `/${item.toLowerCase()}`}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-2 py-2 transition ${isActive ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-50 hover:text-blue-700"}`
                }
              >
                {item}
              </NavLink>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 pl-3 font-medium lg:flex">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold"
            aria-label={displayName}
          >
            {initials}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm text-slate-500 transition hover:text-slate-900"
          >
            Log out
          </button>
        </div>
      </div>

      <button
        type="button"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 lg:hidden"
        aria-label="Open navigation menu"
        aria-expanded={menuOpen}
        aria-controls="dashboard-mobile-menu"
        onClick={() => setMenuOpen(true)}
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {menuOpen &&
        createPortal(
          <div className="fixed inset-0 z-[1000]">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default bg-slate-950/40"
              aria-label="Close navigation menu"
              onClick={() => setMenuOpen(false)}
            />
            <aside
              id="dashboard-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Dashboard navigation"
              className="absolute inset-y-0 right-0 z-10 flex w-[min(300px,85vw)] max-w-full flex-col overflow-y-auto overscroll-contain bg-[#fff] p-6 text-slate-900 shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between">
                <span className="text-lg font-semibold text-slate-900">
                  Menu
                </span>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                  aria-label="Close navigation menu"
                  onClick={() => setMenuOpen(false)}
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav className="mt-8 flex flex-col gap-2 text-lg">
                {["Dashboard", "Orders", "Holdings", "Positions", "Funds"].map(
                  (item) => (
                    <NavLink
                      key={item}
                      to={item === "Dashboard" ? "/" : `/${item.toLowerCase()}`}
                      className={({ isActive }) =>
                        `rounded-lg px-3 py-3 text-slate-800 transition hover:bg-slate-100 ${isActive ? "bg-blue-50 font-semibold text-blue-700" : ""}`
                      }
                      onClick={() => setMenuOpen(false)}
                    >
                      {item}
                    </NavLink>
                  ),
                )}
              </nav>

              <div className="mt-auto border-t border-slate-200 pt-6">
                <p className="text-sm text-slate-600">{displayName}</p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className="mt-4 text-sm text-slate-500 transition hover:text-slate-900"
                >
                  Log out
                </button>
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default Menu;
