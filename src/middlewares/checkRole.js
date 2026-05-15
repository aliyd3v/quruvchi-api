const { Role } = require("../generated/prisma");
const AppError = require("../utils/AppError");

exports.checkRole = (...roles) => {
  return (req, _res, next) => {
    const hasRole = roles.includes(req.user.role);
    const isSuperadmin = req.user.role === Role.SUPERADMIN;

    if (!hasRole && !isSuperadmin) {
      return next(new AppError(403, "forbidden"));
    }

    next();
  };
};
