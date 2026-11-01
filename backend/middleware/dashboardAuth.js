
const jwt = require("jsonwebtoken");

const dashboardCookieName = "tradehub_dashboard_session";

const getCookie = (request, name) => {
  const cookies = request.headers.cookie?.split(";") || [];
  const cookie = cookies.find(
    (entry) => entry.trim().split("=")[0] === name,
  );

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(
      cookie.trim().slice(name.length + 1),
    );
  } catch {
    return null;
  }
};

const createDashboardToken = (user) =>
  jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      tokenType: "dashboard",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    },
  );

const verifyDashboardToken = (token) => {
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    payload.tokenType !== "dashboard"
  ) {
    throw new Error("Dashboard token type is invalid");
  }

  return payload;
};

const clearDashboardSessionCookie = (response, options) => {
  response.clearCookie(dashboardCookieName, options);
};

const requireDashboardAuth = (req, res, next) => {
  try {
    const token = getCookie(req, dashboardCookieName);

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    req.user = verifyDashboardToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = {
  createDashboardToken,
  clearDashboardSessionCookie,
  dashboardCookieName,
  requireDashboardAuth,
  verifyDashboardToken,
};
