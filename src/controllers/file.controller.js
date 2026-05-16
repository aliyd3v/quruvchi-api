const AppError = require("../utils/AppError");
const { localErrorHandler } = require("../utils/localErrorHandler");
const path = require("path");
const fs = require("fs/promises");

const fileController = {
  async getByKey(req, res, next) {
    try {
      const key = req.params.key;
      if (!key) throw new AppError(400, "bad_request");

      const p = path.join(__dirname, "..", "..", "storage", key);

      try {
        const exists = await fs.access(p);
        res.sendFile(p);
      } catch (error) {
        res.sendStatus(404);
      }
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = fileController;
