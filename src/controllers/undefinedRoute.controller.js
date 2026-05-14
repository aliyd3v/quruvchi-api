const AppError = require("../utils/AppError");

exports.undefinedRouteController = (_req, _res, next) => next(new AppError(404, "undefined_route"));
