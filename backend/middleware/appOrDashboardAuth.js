const jwt = require("jsonwebtoken");

const appCookieName = "equityflow_session";
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

const verifyToken = (token, tokenType) => {
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    (tokenType === "dashboard"
      ? payload.tokenType !== "dashboard"
      : payload.tokenType !== undefined)
  ) {
    throw new Error("Invalid authentication token");
  }

  return payload;
};

const createRequireAppOrDashboardAuth = ({
  frontendOrigin,
  dashboardOrigin,
}) => {
  const requireAppOrDashboardAuth = (req, res, next) => {
    const origin = req.headers.origin;
    let cookieName;
    let tokenType;

    if (origin === dashboardOrigin) {
      cookieName = dashboardCookieName;
      tokenType = "dashboard";
    } else if (origin === frontendOrigin) {
      cookieName = appCookieName;
      tokenType = "app";
    } else {
      return res.status(403).json({ message: "Origin not allowed" });
    }

    const token = getCookie(req, cookieName);

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      req.user = verifyToken(token, tokenType);
      return next();
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };

  return requireAppOrDashboardAuth;
};

module.exports = { createRequireAppOrDashboardAuth };
