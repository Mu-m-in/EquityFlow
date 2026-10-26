import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/Home.jsx";
import { API_URL, FRONTEND_URL } from "./config.js";

function App() {
  const [auth, setAuth] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(
    Boolean(API_URL && FRONTEND_URL),
  );
  const [authError, setAuthError] = useState(
    API_URL && FRONTEND_URL ? "" : "Authentication is not configured.",
  );

  useEffect(() => {
    if (!API_URL || !FRONTEND_URL) {
      return;
    }

    fetch(`${API_URL}/auth/me`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (response.status === 401) {
          const loginUrl = new URL("/signup", FRONTEND_URL);
          loginUrl.searchParams.set("mode", "login");
          loginUrl.searchParams.set("returnTo", "/dashboard");
          window.location.replace(loginUrl.toString());
          return null;
        }
        if (!response.ok) {
          throw new Error("Authentication required");
        }
        return response.json();
      })
      .then((data) => {
        if (data) {
          setAuth({ user: data.user });
        }
      })
      .catch(() => {
        setAuthError("Unable to verify authentication. Please try again.");
      })
      .finally(() => setIsCheckingAuth(false));
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setAuth(null);
      window.location.replace(FRONTEND_URL || "/");
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Checking authentication...
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-slate-600">
        {authError}
      </div>
    );
  }

  if (!auth) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <Routes>
        <Route
          path="/*"
          element={<Home user={auth.user} onLogout={handleLogout} />}
        />
      </Routes>
    </div>
  );
}

export default App;
