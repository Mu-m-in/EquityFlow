import { useState } from "react";
import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Homepage from "./landing_page/home/Homepage";
import SignUp from "./landing_page/signup/Signup.jsx";
import SupportPage from "./landing_page/support/SupportPage.jsx";
import ProductPage from "./landing_page/product/ProductPage.jsx";
import PricingPage from "./landing_page/pricing/PricingPage.jsx";
import AboutPage from "./landing_page/about/AboutPage.jsx";
import Footer from "./Footer.jsx";
import Navbar from "./Navbar.jsx";
import NotFound from "./landing_page/NotFound.jsx";
import { API_URL } from "./config.js";
import { AuthContext } from "./AuthContext.jsx";

const App = () => {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(Boolean(API_URL));
  const [authError, setAuthError] = useState(
    API_URL ? "" : "Authentication is not configured.",
  );

  useEffect(() => {
    if (!API_URL) {
      return;
    }

    fetch(`${API_URL}/auth/me`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (response.status === 401) {
          return null;
        }
        if (!response.ok) {
          throw new Error("Unable to verify session");
        }
        return response.json();
      })
      .then((data) => {
        setUser(data?.user || null);
      })
      .catch(() => {
        setUser(null);
        setAuthError("Unable to verify your session. Please try again.");
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
      setUser(null);
    }
  };

  if (isCheckingAuth) {
    return <div className="min-h-screen bg-white" />;
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-slate-600">
        {authError}
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{ user, onAuthenticated: setUser, onLogout: handleLogout }}
    >
      <div className="font-sans pt-16">
        <Navbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<Homepage />} />
          <Route
            path="/signup"
            element={<SignUp onAuthenticated={setUser} />}
          />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </div>
    </AuthContext.Provider>
  );
};

export default App;
