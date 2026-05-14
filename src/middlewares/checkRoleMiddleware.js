const { Roles } = require("../enums/RoleEnum");
const AppError = require("../utils/AppError");

exports.checkRoleMiddleware = (...roles) => {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role) && req.user.role !== Roles.SUPERADMIN) {
      return next(new AppError(403, "forbidden"));
    }
    next();
  };
};
