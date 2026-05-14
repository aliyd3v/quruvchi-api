const { getClientInfo } = require("../utils/getClientInfo");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { sendLogToTg } = require("../utils/sendLogToTg");

exports.sentClientInfoToTgMiddleware = async (req, res, next) => {
  try {
    const userInfo = getClientInfo(req);
    await sendLogToTg(userInfo, "CLIENT_INFO", true);
    next();
  } catch (error) {
    next(localErrorHandler(error));
  }
};
