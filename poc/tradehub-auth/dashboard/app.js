const authOrigin = document.querySelector('meta[name="auth-origin"]')?.content;
const statusElement = document.querySelector("#status");
const resultElement = document.querySelector("#result");
const retryButton = document.querySelector("#retry");
const logoutButton = document.querySelector("#logout");
const transactionKey = "tradehub-auth-poc-transaction";
const transactionLifetimeMs = 5 * 60 * 1000;
let accessToken = "";

const setStatus = (message) => {
  statusElement.textContent = message;
};

const showError = (message) => {
  setStatus(message);
  retryButton.hidden = false;
  logoutButton.hidden = true;
};

const randomBase64Url = (byteLength = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const sha256Base64Url = async (value) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const configuredAuthOrigin = () => {
  let url;
  try {
    url = new URL(authOrigin);
  } catch {
    throw new Error("Set the POC auth origin in dashboard/index.html.");
  }
  const localHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("The POC auth origin must use HTTPS outside localhost.");
  }
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("The POC auth origin must be an origin without a path.");
  }
  return url.origin;
};

const callbackUri = () => `${window.location.origin}/`;

const startAuthorization = async () => {
  retryButton.hidden = true;
  logoutButton.hidden = true;
  resultElement.hidden = true;
  setStatus("Redirecting to the isolated POC auth service…");

  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  const transaction = {
    state,
    verifier,
    createdAt: Date.now(),
  };
  sessionStorage.setItem(transactionKey, JSON.stringify(transaction));

  const authorizeUrl = new URL("/poc/authorize", configuredAuthOrigin());
  authorizeUrl.searchParams.set("client_id", "equityflow-tradehub-poc");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", callbackUri());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  window.location.assign(authorizeUrl.toString());
};

const exchangeCode = async (code, transaction) => {
  const response = await fetch(`${configuredAuthOrigin()}/poc/token`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: transaction.verifier,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Code exchange was rejected.");
  }
  if (
    data.token_type !== "Bearer" ||
    typeof data.access_token !== "string" ||
    !Number.isInteger(data.expires_in)
  ) {
    throw new Error("The POC auth service returned an invalid token response.");
  }
  accessToken = data.access_token;
};

const verifyBearerRequest = async () => {
  const response = await fetch(
    `${configuredAuthOrigin()}/poc/api/whoami`,
    {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Bearer request was rejected.");
  }
  resultElement.textContent = JSON.stringify(data, null, 2);
  resultElement.hidden = false;
  setStatus("Authenticated through a Bearer request. Refresh to test session recovery.");
  retryButton.hidden = true;
  logoutButton.hidden = false;
};

const handleCallback = async (url) => {
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const signedOut = url.searchParams.get("signed_out");
  window.history.replaceState({}, document.title, window.location.pathname);

  if (signedOut === "1") {
    sessionStorage.removeItem(transactionKey);
    accessToken = "";
    setStatus("The POC session was ended. Start again to test login.");
    retryButton.hidden = false;
    logoutButton.hidden = true;
    return;
  }

  const rawTransaction = sessionStorage.getItem(transactionKey);
  sessionStorage.removeItem(transactionKey);
  if (!code || !returnedState || !rawTransaction) {
    throw new Error("The callback is missing its code or pending transaction.");
  }

  let transaction;
  try {
    transaction = JSON.parse(rawTransaction);
  } catch {
    throw new Error("The pending authorization transaction is invalid.");
  }
  if (
    transaction.state !== returnedState ||
    typeof transaction.verifier !== "string" ||
    Date.now() - transaction.createdAt > transactionLifetimeMs
  ) {
    throw new Error("Authorization state is invalid or expired.");
  }

  setStatus("Exchanging the one-time code using PKCE…");
  await exchangeCode(code, transaction);
  await verifyBearerRequest();
};

retryButton.addEventListener("click", () => {
  startAuthorization().catch((error) =>
    showError(error.message || "Unable to start authorization."),
  );
});

logoutButton.addEventListener("click", () => {
  const url = new URL("/poc/logout", configuredAuthOrigin());
  url.searchParams.set("redirect_uri", callbackUri());
  window.location.assign(url.toString());
});

const initialize = async () => {
  const url = new URL(window.location.href);
  if (
    url.searchParams.has("code") ||
    url.searchParams.has("state") ||
    url.searchParams.has("signed_out")
  ) {
    await handleCallback(url);
    return;
  }
  await startAuthorization();
};

initialize().catch((error) => {
  accessToken = "";
  showError(error.message || "The POC authorization flow failed.");
});
