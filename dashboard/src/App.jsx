import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/Home.jsx";
import Login from "./components/Login.jsx";
import { API_URL } from "./config.js";

const getDashboardUser = async () => {
  const response = await fetch(`${API_URL}/dashboard/auth/me`, {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Authentication check failed");
  }

  const data = await response.json();
  return data.user;
};

function App() {
  const [auth, setAuth] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState("");

  const checkDashboardAuth = async () => {
    try {
      const user = await getDashboardUser();
      setAuth(user ? { user } : null);
      setAuthError("");
    } catch {
      setAuthError("Unable to verify authentication. Please try again.");
      setAuth(null);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  useEffect(() => {
    let isCurrent = true;
    getDashboardUser()
      .then((user) => {
        if (isCurrent) {
          setAuth(user ? { user } : null);
          setAuthError("");
        }
      })
      .catch(() => {
        if (isCurrent) {
          setAuthError("Unable to verify authentication. Please try again.");
          setAuth(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsCheckingAuth(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleLogin = (user) => {
    setAuth({ user });
    setAuthError("");
  };

 const handleLogout = async () => {
  try {
    const response = await fetch(`${API_URL}/dashboard/auth/logout`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Logout failed");
    }

    setAuth(null);
    setAuthError("");
  } catch {
    setAuthError("Unable to log out. Please try again.");
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
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p>{authError}</p>
          <button
            type="button"
            onClick={() => {
              setAuthError("");
              setIsCheckingAuth(true);
              checkDashboardAuth();
            }}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!auth) {
    return <Login onLogin={handleLogin} />;
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
