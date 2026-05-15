const { Role } = require("../generated/prisma");
const AppError = require("../utils/AppError");

exports.checkPermission = (permission) => {
  return (req, _res, next) => {
    if (req.user.role === Role.SUPERADMIN) return next();

    if (!req.user.permissions.includes(permission)) {
      return next(new AppError(403, "forbidden"));
    }
    
    next();
  };
};
