const fileService = require("../services/file.service");
const servicesService = require("../services/services.service");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const servicesController = {
  async create(req, res, next) {
    const {
      body,
      file,
      user: { id: createdById },
    } = req;

    try {
      await servicesService.create(body, file, createdById);
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getById(req, res, next) {
    const { params } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await servicesService.getById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getByIdPublic(req, res, next) {
    const { params } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await servicesService.getByIdPublic(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getList(req, res, next) {
    try {
      const data = await servicesService.getList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async update(req, res, next) {
    const {
      body,
      params,
      file,
      user: { id: createdById },
    } = req;
    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await servicesService.update(id, body, file, createdById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      await fileService.unlinkFiles(file);
      next(localErrorHandler(error));
    }
  },

  async softDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await servicesService.softDelete(id, req.user.id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTrash(req, res, next) {
    try {
      const data = await servicesService.getTrash(req.query);
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
      await servicesService.restore(id);
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
      await servicesService.delete(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async publicList(req, res, next) {
    try {
      const data = await servicesService.getPublicList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async publicProjectsCategory(req, res, next) {
    try {
      const data = await servicesService.publicProjectsCategory();
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createSection(req, res, next) {
    const { body, params } = req;
    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await servicesService.createSection(id, body);
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateSection(req, res, next) {
    const { body, params } = req;
    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await servicesService.updateSection(id, body);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteSection(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await servicesService.deleteSection(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createOrder(req, res, next) {
    const { body, params } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await servicesService.createOrder({ serviceId: id, data: body });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = servicesController;
