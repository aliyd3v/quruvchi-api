const fileService = require("../services/file.service");
const AppError = require("../utils/AppError");
const { localErrorHandler } = require("../utils/localErrorHandler");

const fileController = {
  async getByKey(req, res, next) {
    try {
      const key = req.params.key;
      if (!key) throw new AppError(400, "bad_request");
      const file = await fileService.getByKey(key);
      res.setHeader("Content-Type", file.ContentType);
      file.Body.pipe(res);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = fileController;
