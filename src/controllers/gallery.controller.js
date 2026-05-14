const galleryService = require("../services/gallery.service");
const AppError = require("../utils/AppError");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { idChecker } = require("../utils/idChecker");

const galleryController = {
  async create(req, res, next) {
    const {
      file,
      user: { id: createdById },
    } = req;
    try {
      await galleryService.create(file, createdById);
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getList(req, res, next) {
    try {
      const data = await galleryService.getList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getPublic(req, res, next) {
    try {
      const data = await galleryService.getPublicList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getById(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await galleryService.getById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async update(req, res, next) {
    const {
      params,
      file,
      user: { id: createdById },
    } = req;
    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await galleryService.update(id, file, createdById);
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
      await galleryService.softDelete(id, deletedById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = galleryController;
