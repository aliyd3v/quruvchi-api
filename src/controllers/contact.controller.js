const contactService = require("../services/contact.service");
const { localErrorHandler } = require("../utils/localErrorHandler");

const contactController = {
  async create(req, res, next) {
    const { body } = req;

    try {
      await contactService.create({ data: body });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = contactController;
