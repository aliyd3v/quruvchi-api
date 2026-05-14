const fileService = require("../services/file.service");
const newsService = require("../services/news.service");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const newsController = {
  async create(req, res, next) {
    const {
      body,
      files: { ["file"]: file, ["files"]: files },
      user: { id: createdById },
    } = req;

    try {
      await newsService.create(body, file[0], files, createdById);
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getList(req, res, next) {
    try {
      const data = await newsService.getList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getPublicList(req, res, next) {
    try {
      const data = await newsService.getPublicList(req.query);
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
      const data = await newsService.getById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getPublicById(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await newsService.getPublicById(id);
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
      body,
      files: { ["file"]: file, ["files"]: files },
      user: { id: createdById },
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await newsService.update(id, body, file?.[0] || null, files, createdById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      await fileService.unlinkFiles(file);
      await fileService.unlinkFiles(files);
      next(localErrorHandler(error));
    }
  },

  async getTrash(req, res, next) {
    try {
      const data = await newsService.getTrash(req.query);
      res.status(200).json({
        status: "success",
        ...data,
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
      await newsService.softDelete(id, deletedById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restore(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await newsService.restore(id);
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
      await newsService.delete(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteGalleryItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await newsService.deleteGalleryItem(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = newsController;
