const { Roles } = require("../enums/RoleEnum");
const AppError = require("../utils/AppError");

exports.checkPermissionMiddleware = (permission) => {
  return (req, _res, next) => {
    if (req.user.role === Roles.SUPERADMIN) return next();
    if (!req.user.permissions.includes(permission)) return next(new AppError(403, "forbidden"));
    next();
  };
};
