const catalogService = require("../services/catalog.service");
const fileService = require("../services/file.service");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const catalogController = {
  async createDirection(req, res, next) {
    const {
      body: data,
      user: { id: createdById },
      file,
    } = req;

    try {
      await catalogService.createDirection({ data, createdById, file });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      await fileService.unlinkFiles(req.file);
      next(localErrorHandler(error));
    }
  },

  async getDirectionsList(req, res, next) {
    try {
      const data = await catalogService.getDirectionsList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getPublicDirectionsList(req, res, next) {
    try {
      const data = await catalogService.getPublicDirectionsList();
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchDirection(req, res, next) {
    try {
      const data = await catalogService.searchDirection(req.query);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneDirection(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await catalogService.directionById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateDirection(req, res, next) {
    const {
      body: data,
      user: { id: createdById },
      params,
      file,
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.updateDirection({ id, data, file, createdById });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      await fileService.unlinkFiles(req.file);
      next(localErrorHandler(error));
    }
  },

  async softDeleteDirection(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.softDeleteDirection(id, req.user.id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreDirection(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.restoreDirection(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDirectionTrash(req, res, next) {
    try {
      const data = await catalogService.getDirectionTrash(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteDirection(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.deleteDirection(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async create(req, res, next) {
    try {
      const {
        body,
        files: { ["file"]: file, ["files"]: files },
        user: { id: createdById },
      } = req;

      await catalogService.create({ createdById, data: body, file: file?.[0] || null, files });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      const data = await catalogService.getList(req.query);
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
      const data = await catalogService.getPublicList(req.query);
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
      const data = await catalogService.getById(id);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getPublicById(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await catalogService.getPublicById(id);
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
      params,
      body,
      files: { ["file"]: file, ["files"]: files },
      user: { id: createdById },
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.update({ id, createdById, data: body, file: file?.[0] || null, files });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async softDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const { id: deletedById } = req.user;
      await catalogService.softDelete(id, deletedById);
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
      await catalogService.restore(id);
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
      await catalogService.delete(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const {
        body,
        user: { id: createdById },
      } = req;
      await catalogService.createItem({ catalogId: id, createdById, data: body });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateItem(req, res, next) {
    const {
      params,
      body: data,
      user: { id: createdById },
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.updateItem({ catalogItemId: id, data, createdById });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async softDeleteItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const { id: createdById } = req.user;
      await catalogService.softDeleteItem(id, createdById);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreMaterial(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.restoreMaterial(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteMaterial(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.deleteMaterial(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createMaterial(req, res, next) {
    const {
      body: data,
      user: { id: createdById },
    } = req;

    try {
      await catalogService.createMaterial({ data, createdById });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getMaterialsList(req, res, next) {
    try {
      const data = await catalogService.getMaterialsList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchMaterial(req, res, next) {
    try {
      const data = await catalogService.searchMaterial(req.query);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getMaterialById(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await catalogService.getMaterialById(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateMaterial(req, res, next) {
    const { body: data, params } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.updateMaterial({ id, data });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async softDeleteMaterial(req, res, next) {
    const {
      params,
      user: { id: deletedById },
    } = req;

    try {
      const id = idChecker(params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.softDeleteMaterial({ id, deletedById });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getCatalogTrash(req, res, next) {
    try {
      const { query } = req;
      const data = await catalogService.getCatalogTrash(query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getCatalogMaterialTrash(req, res, next) {
    try {
      const { query } = req;
      const data = await catalogService.getCatalogMaterialTrash(query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getCatalogExcel(req, res, next) {
    try {
      const data = await catalogService.getExcel(req.query);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(data);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getCatalogItemExcel(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      const data = await catalogService.getItemExcel(id);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(data);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteGalleryItem(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.deleteGalleryItem(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createOrder(req, res, next) {
    const { params, body } = req;

    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await catalogService.createOrder({ catalogId: id, data: body });
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = catalogController;
