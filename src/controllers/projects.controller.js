const projectsService = require("../services/projects.service");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { idChecker } = require("../utils/idChecker");
const fileService = require("../services/file.service");

const projectsController = {
  async create(req, res, next) {
    const {
      body,
      files: { ["file"]: file, ["files"]: files },
      user: { id: createdById },
    } = req;

    try {
      await projectsService.create(body, file[0], files, createdById);
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getList(req, res, next) {
    try {
      const data = await projectsService.getList(req.query);
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
      const data = await projectsService.getPublicList(req.query);
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
      const data = await projectsService.getById(id);
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
      const data = await projectsService.getPublicById(id);
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
      body,
      params,
      files: { ["file"]: file, ["files"]: files },
      user: { id: createdById },
    } = req;
    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await projectsService.update(id, body, file[0], files, createdById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      if (file) {
        await fileService.unlinkFiles(file);
      }
      if (Array.isArray(files) && files.length) {
        await fileService.unlinkFiles(files);
      }
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
      await projectsService.softDelete(id, deletedById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTrash(req, res, next) {
    try {
      const data = await projectsService.getTrash(req.query);
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
      await projectsService.restore(id);
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
      await projectsService.delete(id);
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
      await projectsService.deleteGalleryItem(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = projectsController;
