const translations = require("../constants");
const AppError = require("../utils/AppError");
const { sendLogToTg } = require("../utils/sendLogToTg");

exports.globalErrorHandler = async (err, _req, res, _next) => {
  // console.log(err);
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: translations[err.message] || err.message,
      errors: err.errors,
      // stack: err.stack,
    });
  }

  // Logging error with send to telegram bot.
  await sendLogToTg(err, "INTERNAL_SERVER_ERROR", false);

  return res.status(500).json({
    status: "error",
    message: err.message || translations["something_went_wrong"],
    // stack: err.stack
  });
};
