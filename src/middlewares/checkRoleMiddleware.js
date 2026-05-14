const { Role } = require("../generated/prisma");
const AppError = require("../utils/AppError");

exports.checkRoleMiddleware = (...Role) => {
  return (req, _res, next) => {
    if (!Role.includes(req.user.role) && req.user.role !== Role.SUPERADMIN) {
      return next(new AppError(403, "forbidden"));
    }
    next();
  };
};
