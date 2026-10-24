import { useState } from "react";
import { NavLink } from "react-router-dom";
import { DASHBOARD_URL } from "./config.js";

const navLinks = [
  { label: "TradeHub", href: DASHBOARD_URL },
  { label: "About", href: "/about" },
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Support", href: "/support" },
];

const openDashboard = (event, dashboardUrl) => {
  event.preventDefault();
  if (!dashboardUrl) {
    return;
  }
  window.open(dashboardUrl, "_blank", "noopener,noreferrer");
};

const Navbar = ({ user, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleNavLinks = user
    ? navLinks
    : [{ label: "Signup", href: "/signup" }, ...navLinks];

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white text-[#444444] shadow-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <NavLink to="/" className="font-semibold text-blue-900 text-lg">
          EquityFlow
        </NavLink>

        <nav className="hidden gap-6 text-sm md:flex px-2 font-normal">
          {visibleNavLinks.map((link) =>
            link.href.startsWith("http") ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-blue-200"
                onClick={(event) => openDashboard(event, link.href)}
              >
                {link.label}
              </a>
            ) : (
              <NavLink
                key={link.label}
                to={link.href}
                className={({ isActive }) =>
                  `transition ${isActive ? "text-blue-700 font-semibold" : "hover:text-blue-200"}`
                }
              >
                {({ isActive }) => (
                  <span aria-current={isActive ? "page" : undefined}>
                    {link.label}
                  </span>
                )}
              </NavLink>
            ),
          )}
        </nav>

        {user && (
          <div className="hidden items-center gap-3 text-sm md:flex">
            <span className="text-slate-700">Hi, {user.name}</span>
            <button
              type="button"
              onClick={onLogout}
              className="text-slate-500 transition hover:text-slate-900"
            >
              Logout
            </button>
          </div>
        )}

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 md:hidden"
          aria-label="Open navigation menu"
          onClick={() => setMenuOpen(true)}
        >
          <span className="sr-only">Open navigation</span>
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      <div
        className={`fixed inset-0 z-50 transition duration-300 ${menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setMenuOpen(false)}
        />
        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-xs bg-white p-6 shadow-2xl transition-transform duration-300 ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg text-slate-900">Menu</span>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
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
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="mt-10 flex flex-col gap-4 text-lg">
            {visibleNavLinks.map((link) =>
              link.href.startsWith("http") ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg px-3 py-3 text-slate-800 transition hover:bg-slate-100"
                  onClick={(event) => {
                    setMenuOpen(false);
                    openDashboard(event, link.href);
                  }}
                >
                  {link.label}
                </a>
              ) : (
                <NavLink
                  key={link.label}
                  to={link.href}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-3 text-slate-800 transition hover:bg-slate-100 ${isActive ? "bg-slate-100 font-medium" : ""}`
                  }
                  onClick={() => setMenuOpen(false)}
                >
                  {({ isActive }) => (
                    <span aria-current={isActive ? "page" : undefined}>
                      {link.label}
                    </span>
                  )}
                </NavLink>
              ),
            )}
          </nav>

          {user && (
            <div className="mt-8 border-t border-slate-200 pt-6">
              <p className="text-sm text-slate-600">Hi, {user.name}</p>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                className="mt-4 text-sm text-slate-500 transition hover:text-slate-900"
              >
                Logout
              </button>
            </div>
          )}
        </aside>
      </div>
    </header>
  );
};

export default Navbar;
