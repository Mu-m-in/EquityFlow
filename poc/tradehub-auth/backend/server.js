require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = Number(process.env.PORT || 4317);
const CLIENT_ID = "equityflow-tradehub-poc";
const COOKIE_NAME = "equityflow_tradehub_poc_session";
const TOKEN_ISSUER = "equityflow-tradehub-auth-poc";
const TOKEN_AUDIENCE = "equityflow-tradehub-dashboard-poc";
const TOKEN_PURPOSE = "poc-dashboard-access";

const required = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
};

const parseOrigin = (value, name) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an origin URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== value ||
    url.username ||
    url.password
  ) {
    throw new Error(`${name} must be an exact HTTP(S) origin`);
  }
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:"
  ) {
    throw new Error(`${name} must use HTTPS in production`);
  }
  return url.origin;
};

const API_ORIGIN = parseOrigin(
  required("POC_API_ORIGIN"),
  "POC_API_ORIGIN",
);
const DASHBOARD_ORIGIN = parseOrigin(
  required("POC_DASHBOARD_ORIGIN"),
  "POC_DASHBOARD_ORIGIN",
);
const CALLBACK_URI = required("POC_CALLBACK_URI");
const callbackUrl = new URL(CALLBACK_URI);
if (
  callbackUrl.origin !== DASHBOARD_ORIGIN ||
  callbackUrl.pathname !== "/" ||
  callbackUrl.search ||
  callbackUrl.hash ||
  callbackUrl.username ||
  callbackUrl.password
) {
  throw new Error(
    "POC_CALLBACK_URI must be the exact dashboard origin with path /",
  );
}

const TEST_EMAIL = required("POC_TEST_EMAIL").toLowerCase();
const TEST_PASSWORD = required("POC_TEST_PASSWORD");
if (
  TEST_PASSWORD.length < 16 ||
  TEST_PASSWORD.startsWith("replace-with-")
) {
  throw new Error("POC_TEST_PASSWORD must be a unique password of at least 16 characters");
}
const testPasswordHash = bcrypt.hash(TEST_PASSWORD, 12);
const JWT_SECRET = required("POC_JWT_SECRET");
if (JWT_SECRET.length < 32 || JWT_SECRET.startsWith("replace-with-")) {
  throw new Error(
    "POC_JWT_SECRET must be a unique random secret of at least 32 characters",
  );
}

const positiveInteger = (name, fallback) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

const SESSION_TTL_SECONDS = positiveInteger(
  "POC_SESSION_TTL_SECONDS",
  900,
);
const CODE_TTL_SECONDS = positiveInteger("POC_CODE_TTL_SECONDS", 60);
const ACCESS_TTL_SECONDS = positiveInteger(
  "POC_ACCESS_TTL_SECONDS",
  180,
);
if (CODE_TTL_SECONDS > 120 || ACCESS_TTL_SECONDS > 300) {
  throw new Error("POC code and access-token lifetimes must remain short");
}

const sessionByCookieHash = new Map();
const sessionById = new Map();
const authorizationRequests = new Map();
const authorizationCodes = new Map();
const logoutRequests = new Map();

const randomToken = () => crypto.randomBytes(32).toString("base64url");
const tokenHash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const isLive = (record) => record && record.expiresAt > Date.now();

const cleanupExpired = () => {
  for (const store of [
    authorizationRequests,
    authorizationCodes,
    logoutRequests,
  ]) {
    for (const [key, value] of store) {
      if (!isLive(value)) {
        store.delete(key);
      }
    }
  }
  for (const [sessionId, session] of sessionById) {
    if (!isLive(session)) {
      sessionById.delete(sessionId);
    }
  }
  for (const [cookieHash, session] of sessionByCookieHash) {
    if (
      !isLive(session) ||
      !isLive(sessionById.get(session.sessionId))
    ) {
      sessionByCookieHash.delete(cookieHash);
    }
  }
};

const setSessionCookie = (res, value) => {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${value}; Path=/poc/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
  );
};

const clearSessionCookie = (res) => {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/poc/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
};

const readSessionCookie = (req) => {
  const cookieHeader = req.headers.cookie || "";
  const prefix = `${COOKIE_NAME}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : "";
};

const getSession = (req) => {
  const cookie = readSessionCookie(req);
  if (!cookie) {
    return null;
  }
  const session = sessionByCookieHash.get(tokenHash(cookie));
  if (!isLive(session)) {
    return null;
  }
  return session;
};

const requireApiOrigin = (req, res, next) => {
  if (req.headers.origin !== DASHBOARD_ORIGIN) {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", DASHBOARD_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  res.setHeader("Access-Control-Max-Age", "300");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
};

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  cleanupExpired();
  next();
});
app.use(express.urlencoded({ extended: false, limit: "4kb" }));
app.use(express.json({ limit: "4kb" }));

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again later." },
});

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

const makeLoginPage = (transactionId, message = "") => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TradeHub authentication POC</title>
    <style>
      body { font: 16px system-ui, sans-serif; margin: 3rem auto; max-width: 24rem; padding: 0 1rem; color: #17243a; }
      label { display: block; margin: 1rem 0 .35rem; }
      input { box-sizing: border-box; padding: .7rem; width: 100%; }
      button { margin-top: 1.2rem; padding: .7rem 1rem; }
      .error { color: #a11; }
    </style>
  </head>
  <body>
    <h1>TradeHub POC sign in</h1>
    <p>Use only the separately configured POC test account.</p>
    ${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ""}
    <form method="post" action="/poc/login" autocomplete="on">
      <input type="hidden" name="transaction" value="${escapeHtml(transactionId)}">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Continue to POC dashboard</button>
    </form>
  </body>
</html>`;

const makeLogoutPage = (transactionId) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>End POC session</title>
  </head>
  <body>
    <h1>End POC dashboard session?</h1>
    <form method="post" action="/poc/logout">
      <input type="hidden" name="transaction" value="${escapeHtml(transactionId)}">
      <button type="submit">End POC session</button>
    </form>
  </body>
</html>`;

const validState = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);
const validChallenge = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const validVerifier = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9._~-]{43,128}$/.test(value);

const issueCodeAndRedirect = (res, transaction, session, statusCode = 302) => {
  const code = randomToken();
  authorizationCodes.set(tokenHash(code), {
    challenge: transaction.challenge,
    sessionId: session.sessionId,
    expiresAt: Date.now() + CODE_TTL_SECONDS * 1000,
  });
  const callback = new URL(CALLBACK_URI);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", transaction.state);
  return res.redirect(statusCode, callback.toString());
};

const checkSameOrigin = (req, res) => {
  if (req.headers.origin !== API_ORIGIN) {
    res.status(403).send("Origin is not allowed.");
    return false;
  }
  return true;
};

app.get("/poc/health", (_req, res) => {
  res.json({ status: "ok", service: "tradehub-auth-poc" });
});

app.get("/poc/authorize", (req, res) => {
  const {
    client_id: clientId,
    response_type: responseType,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: challengeMethod,
  } = req.query;

  if (
    clientId !== CLIENT_ID ||
    responseType !== "code" ||
    redirectUri !== CALLBACK_URI ||
    !validState(state) ||
    !validChallenge(challenge) ||
    challengeMethod !== "S256"
  ) {
    return res.status(400).send("Invalid authorization request.");
  }

  const transactionId = randomToken();
  const transaction = {
    state,
    challenge,
    redirectUri: CALLBACK_URI,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  authorizationRequests.set(tokenHash(transactionId), transaction);

  const session = getSession(req);
  if (session) {
    authorizationRequests.delete(tokenHash(transactionId));
    return issueCodeAndRedirect(res, transaction, session);
  }

  if (readSessionCookie(req)) {
    clearSessionCookie(res);
  }
  return res.type("html").send(makeLoginPage(transactionId));
});

app.post("/poc/login", loginRateLimit, async (req, res) => {
  if (!checkSameOrigin(req, res)) {
    return;
  }

  const transactionId = String(req.body.transaction || "");
  const transactionKey = tokenHash(transactionId);
  const transaction = authorizationRequests.get(transactionKey);
  if (!isLive(transaction) || transaction.redirectUri !== CALLBACK_URI) {
    return res.status(400).send("Sign-in request expired. Return to the POC dashboard and retry.");
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const matches = await bcrypt.compare(password, await testPasswordHash);
  if (email !== TEST_EMAIL || !matches) {
    return res
      .status(401)
      .type("html")
      .send(makeLoginPage(transactionId, "Email or password is incorrect."));
  }

  authorizationRequests.delete(transactionKey);
  const cookieValue = randomToken();
  const sessionId = randomToken();
  const session = {
    sessionId,
    userId: "poc-test-user",
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  sessionByCookieHash.set(tokenHash(cookieValue), session);
  sessionById.set(sessionId, session);
  setSessionCookie(res, cookieValue);

  return issueCodeAndRedirect(res, transaction, session, 303);
});

app.options("/poc/token", requireApiOrigin, (_req, res) =>
  res.status(204).end(),
);
app.post("/poc/token", requireApiOrigin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const code = String(req.body.code || "");
  const verifier = String(req.body.code_verifier || "");
  if (!code || !validVerifier(verifier)) {
    return res.status(400).json({ error: "Invalid code exchange." });
  }

  const codeKey = tokenHash(code);
  const authorizationCode = authorizationCodes.get(codeKey);
  authorizationCodes.delete(codeKey);
  if (!isLive(authorizationCode)) {
    return res.status(401).json({ error: "Authorization code expired or used." });
  }

  const session = sessionById.get(authorizationCode.sessionId);
  if (!isLive(session)) {
    return res.status(401).json({ error: "POC session expired." });
  }

  const calculatedChallenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const expected = Buffer.from(authorizationCode.challenge);
  const actual = Buffer.from(calculatedChallenge);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return res.status(401).json({ error: "PKCE verification failed." });
  }

  const accessToken = jwt.sign(
    {
      purpose: TOKEN_PURPOSE,
      sid: session.sessionId,
    },
    JWT_SECRET,
    {
      algorithm: "HS256",
      audience: TOKEN_AUDIENCE,
      expiresIn: ACCESS_TTL_SECONDS,
      issuer: TOKEN_ISSUER,
      subject: session.userId,
    },
  );

  return res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
  });
});

const requireAccessToken = (req, res, next) => {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(
    req.headers.authorization || "",
  );
  if (!match) {
    return res.status(401).json({ error: "Bearer token required." });
  }

  try {
    const payload = jwt.verify(match[1], JWT_SECRET, {
      algorithms: ["HS256"],
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload !== "object" ||
      payload.purpose !== TOKEN_PURPOSE ||
      typeof payload.sid !== "string" ||
      payload.sub !== "poc-test-user"
    ) {
      return res.status(401).json({ error: "Invalid POC access token." });
    }
    const session = sessionById.get(payload.sid);
    if (!isLive(session)) {
      return res.status(401).json({ error: "POC session expired." });
    }
    req.pocUser = { userId: session.userId, tokenExpiresAt: payload.exp };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired POC access token." });
  }
};

app.options("/poc/api/whoami", requireApiOrigin, (_req, res) =>
  res.status(204).end(),
);
app.get(
  "/poc/api/whoami",
  requireApiOrigin,
  requireAccessToken,
  (req, res) => {
    return res.json({
      authenticated: true,
      userId: req.pocUser.userId,
      credential: "authorization-bearer",
      tokenExpiresAt: new Date(req.pocUser.tokenExpiresAt * 1000).toISOString(),
    });
  },
);

app.get("/poc/logout", (req, res) => {
  if (req.query.redirect_uri !== CALLBACK_URI) {
    return res.status(400).send("Invalid logout request.");
  }
  const session = getSession(req);
  if (!session) {
    const callback = new URL(CALLBACK_URI);
    callback.searchParams.set("signed_out", "1");
    return res.redirect(302, callback.toString());
  }

  const transactionId = randomToken();
  logoutRequests.set(tokenHash(transactionId), {
    sessionId: session.sessionId,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return res.type("html").send(makeLogoutPage(transactionId));
});

app.post("/poc/logout", (req, res) => {
  if (!checkSameOrigin(req, res)) {
    return;
  }
  const transactionId = String(req.body.transaction || "");
  const transactionKey = tokenHash(transactionId);
  const transaction = logoutRequests.get(transactionKey);
  logoutRequests.delete(transactionKey);
  const session = getSession(req);
  if (
    !isLive(transaction) ||
    !session ||
    transaction.sessionId !== session.sessionId
  ) {
    clearSessionCookie(res);
    return res.status(400).send("Logout request expired. Return to the POC dashboard.");
  }

  session.expiresAt = Date.now();
  sessionById.delete(session.sessionId);
  for (const [cookieHash, storedSession] of sessionByCookieHash) {
    if (storedSession.sessionId === session.sessionId) {
      sessionByCookieHash.delete(cookieHash);
    }
  }
  clearSessionCookie(res);
  const callback = new URL(CALLBACK_URI);
  callback.searchParams.set("signed_out", "1");
  return res.redirect(303, callback.toString());
});

app.use((_req, res) => {
  res.status(404).json({ error: "POC endpoint not found." });
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) {
    return;
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request is too large." });
  }
  return res.status(500).json({ error: "POC request failed." });
});

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port");
}

app.listen(PORT, () => {
  console.info(`TradeHub auth POC listening on ${API_ORIGIN}`);
});
