import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, DASHBOARD_URL } from "../../config.js";

const Signup = ({ onAuthenticated }) => {
  const navigate = useNavigate();
  const returnTo = new URLSearchParams(window.location.search).get("returnTo");
  const [isLoggingIn, setIsLoggingIn] = useState(
    () => new URLSearchParams(window.location.search).get("mode") === "login",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!API_URL) {
        throw new Error("Authentication is not configured.");
      }
      let response = await fetch(
        `${API_URL}${isLoggingIn ? "/auth/login" : "/auth/register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            isLoggingIn ? { email, password } : { name, email, password },
          ),
        },
      );
      const data = await response.json();

      if (!isLoggingIn && response.status === 409) {
        response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        const loginData = await response.json();

        if (response.ok) {
          onAuthenticated(loginData.user);
          if (returnTo === "/dashboard" && DASHBOARD_URL) {
            window.location.href = DASHBOARD_URL;
          } else {
            navigate("/");
          }
          return;
        }

        throw new Error(
          "An account exists with this email, but the password does not match",
        );
      }

      if (!response.ok) {
        throw new Error(
          data.message ||
            (isLoggingIn ? "Unable to log in" : "Unable to create account"),
        );
      }

      onAuthenticated(data.user);
      if (returnTo === "/dashboard" && DASHBOARD_URL) {
        window.location.href = DASHBOARD_URL;
      } else {
        navigate("/");
      }
    } catch (requestError) {
      setError(requestError.message);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-16">
      <section className="w-full rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-medium text-slate-900">
          {isLoggingIn ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isLoggingIn
            ? "Log in to open your trading dashboard."
            : "One account for TradeHub and your trading dashboard."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!isLoggingIn && (
            <input
              required
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
            />
          )}
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
          <input
            required
            type="password"
            placeholder="Password (minimum 8 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500"
          />
          {error && (
            <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-blue-500 px-6 py-3 font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? isLoggingIn
                ? "Logging in..."
                : "Creating account..."
              : isLoggingIn
                ? "Log in"
                : "Sign up for free"}
          </button>
        </form>

        <button
          type="button"
          className="mt-5 text-sm text-blue-700 hover:underline"
          onClick={() => {
            setIsLoggingIn((current) => !current);
            setName("");
            setEmail("");
            setPassword("");
            setError("");
          }}
        >
          {isLoggingIn
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </section>
    </main>
  );
};

export default Signup;
