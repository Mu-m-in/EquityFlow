const createRequireDashboardOrigin = (dashboardOrigin) => {
  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin !== dashboardOrigin) {
      return res.status(403).json({ message: "Origin not allowed" });
    }

    return next();
  };
};

const createRequireFrontendOrigin = (frontendOrigin) => {
  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin !== frontendOrigin) {
      return res.status(403).json({ message: "Origin not allowed" });
    }

    return next();
  };
};

module.exports = {
  createRequireDashboardOrigin,
  createRequireFrontendOrigin,
};