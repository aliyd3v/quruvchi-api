const inboxService = require("../services/inbox.service");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { idChecker } = require("../utils/idChecker");
const AppError = require("../utils/AppError");

const inboxController = {
  async getList(req, res, next) {
    const {
      query,
      user: { id: userId, role: userRole },
    } = req;

    try {
      const data = await inboxService.getList({ query, userId, userRole });
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getById(req, res, next) {
    const { params, user } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await inboxService.getById({ id, user });
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      throw error;
    }
  },

  async changeStatus(req, res, next) {
    const { params, body } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inboxService.changeStatus({ id, data: body });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async softDelete(req, res, next) {
    const {
      params,
      user: { id: deletedById },
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inboxService.softDelete({ id, deletedById });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTrash(req, res, next) {
    const { query } = req;

    try {
      const data = await inboxService.getTrash({ query });
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restore(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inboxService.restore({ id });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async delete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inboxService.delete({ id });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = inboxController;
