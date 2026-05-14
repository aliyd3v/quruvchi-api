const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");
const fileService = require("../services/file.service");
const inventoryService = require("../services/inventory.service");

const inventoryController = {
  async createOne(req, res, next) {
    try {
      await inventoryService.create(req);
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
      const data = await inventoryService.getList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getHistories(req, res, next) {
    try {
      const data = await inventoryService.historiesList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserHistories(req, res, next) {
    try {
      const data = await inventoryService.userHistoriesList(req.query, req.user.id);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await inventoryService.getById(id, req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getBatches(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await inventoryService.getInventoryBatches(id);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.update(id, req.body);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async deleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.softDelete(id, req.user.id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getTrash(req, res, next) {
    try {
      const data = await inventoryService.trashList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.restore(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async createHistory(req, res, next) {
    try {
      await inventoryService.createHistory(req);
      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      if (req.files && Array.isArray(req.files) && req.files.length) {
        await fileService.unlinkFiles(req.files);
      }
      next(localErrorHandler(error));
    }
  },

  async deleteOneHistory(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.softDeleteHistory(id, req.user.id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOneHistory(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.updateHistory(id, req.body);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAllStaffVersion(req, res, next) {
    try {
      const data = await inventoryService.getListForStaff(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneStaffVersion(req, res, next) {
    try {
      const data = await inventoryService.getByIdForStaff(req);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.delete(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeletedHistories(req, res, next) {
    try {
      const data = await inventoryService.historiesTrashList(req.query);
      res.status(200).json({
        status: "success",
        ...data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOneHistory(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.restoreHistory(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDeleteHistory(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      await inventoryService.deleteHistory(id);
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getHistoriesExcel(req, res, next) {
    try {
      const data = await inventoryService.historiesExcelDoc(req.query);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(data);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchInventory(req, res, next) {
    try {
      const key = typeof req.query.key === "string" ? req.query.key.trim() : null;
      const data = await inventoryService.search(key);
      res.status(200).json({
        status: "success",
        data,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getExcelDoc(req, res, next) {
    try {
      const data = await inventoryService.excelDoc(req.query);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(data);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOneExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const data = await inventoryService.inventoryExcelDoc(id);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(data);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getUserHistoriesExcelDoc(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) throw new AppError(400, "bad_request");
      const {
        query,
        user: { id: userId },
      } = req;
      const data = await inventoryService.userHistoriesExcelDoc(query, userId);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(data);
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = inventoryController;
