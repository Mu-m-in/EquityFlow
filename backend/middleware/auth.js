const jwt = require("jsonwebtoken");

const getCookie = (request, name) => {
  const cookies = request.headers.cookie?.split(";") || [];
  const cookie = cookies.find((entry) => entry.trim().startsWith(`${name}=`));
  return cookie
    ? decodeURIComponent(cookie.trim().slice(name.length + 1))
    : null;
};

const requireAuth = (req, res, next) => {
  const token = getCookie(req, "equityflow_session");

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = { requireAuth };
