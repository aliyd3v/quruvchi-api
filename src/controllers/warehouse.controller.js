const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const warehouseController = {
  async createOne(req, res, next) {
    try {
      const name = req.body.name;

      const nameCondidat = await prisma.warehouse.findUnique({ where: { name } });
      if (nameCondidat && nameCondidat.isActive) {
        return next(new AppError(400, "warehouse_already_exist_with_this_name"));
      }
      if (nameCondidat && !nameCondidat.isActive) {
        return next(new AppError(400, "warehouse_already_exist_with_this_name_and_is_deleted"));
      }

      await prisma.warehouse.create({ data: { name } });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(req, res, next) {
    try {
      let {
        puery: { page = 1, limit = 10, key, sort, reverse },
      } = req;

      page = Number(page);
      limit = Number(limit);
      reverse = reverse === "true";
      if (isNaN(page) || page <= 0) page = 1;
      if (isNaN(limit) || limit <= 0) limit = 30;
      let take = limit;
      key = key?.trim() || "";

      sort = ["name", "createdAt"].includes(sort) ? sort : "name";
      const orderBy = {};
      orderBy[sort] = reverse === true ? "desc" : "asc";

      const findWhere = { isActive: true };
      if (key) {
        findWhere.name = { contains: key, mode: "insensitive" };
      }

      const count = await prisma.warehouse.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      if (totalPage === 0) page = 1;
      else if (totalPage !== 0 && page > totalPage) page = totalPage;
      const skip = (page - 1) * limit;

      const warehouses = await prisma.warehouse.findMany({
        orderBy,
        take,
        skip,
        where: findWhere,
        include: {
          _count: {
            select: {
              inventories: {
                where: { isActive: true },
              },
            },
          },
        },
      });

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        data: warehouses,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) {
        return next(new AppError(400, "bad_request"));
      }

      const warehouse = await prisma.warehouse.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!warehouse) {
        return next(new AppError(404, "warehause_not_found"));
      }
      if (!warehouse.isActive) {
        return next(new AppError(400, "warehouse_is_deleted"));
      }

      let {
        query: { page = 1, limit = 30, reverse, sort, key },
      } = req;

      page = Number(page);
      limit = Number(limit);
      reverse = reverse === "true";
      if (isNaN(page) || page <= 0) page = 1;
      if (isNaN(limit) || limit <= 0) limit = 30;
      let take = limit;
      key = key?.trim() || "";

      sort = ["name", "createdAt"].includes(sort) ? sort : "name";
      const orderBy = {};
      orderBy[sort] = reverse === true ? "desc" : "asc";

      const findWhere = { isActive: true, warehouseId: id };
      if (key) {
        findWhere.name = { contains: key, mode: "insensitive" };
      }

      const count = await prisma.inventory.count({ where: findWhere });
      let totalPage = Math.ceil(count / limit);
      if (totalPage === 0) page = 1;
      else if (totalPage !== 0 && page > totalPage) page = totalPage;
      const skip = (page - 1) * limit;

      const [inventories, inventoriesCount] = await Promise.all([
        prisma.inventory.findMany({
          orderBy,
          take,
          skip,
          where: findWhere,
          select: {
            id: true,
            name: true,
            isReusable: true,
            unit: true,
            quantity: true,
            createdAt: true,
            updatedAt: true,
            createdBy: {
              select: {
                id: true,
                fname: true,
                lname: true,
                role: true,
                avatar: {
                  select: {
                    url: true,
                  },
                },
              },
            },
          },
        }),
        prisma.inventory.count({ where: { isActive: true, warehouseId: id } }),
      ]);

      res.status(200).json({
        status: "success",
        page,
        limit,
        sort,
        totalCount: count,
        totalPage,
        reverse,
        warehouse,
        inventories,
        inventoriesCount,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) {
        return next(new AppError(400, "bad_request"));
      }

      const warehouse = await prisma.warehouse.findUnique({ where: { id } });
      if (!warehouse) {
        return next(new AppError(404, "warehause_not_found"));
      }
      if (!warehouse.isActive) {
        return next(new AppError(400, "warehouse_is_deleted"));
      }

      const name = req.body.name;

      const nameCondidat = await prisma.warehouse.findUnique({ where: { name } });
      if (nameCondidat && nameCondidat.id !== id && nameCondidat.isActive) {
        return next(new AppError(400, "warehouse_already_exist_with_this_name"));
      }
      if (nameCondidat && nameCondidat.id !== id && !nameCondidat.isActive) {
        return next(new AppError(400, "warehouse_already_exist_with_this_name_and_is_deleted"));
      }

      await prisma.warehouse.update({ where: { id }, data: { name: req.body.name } });

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
      if (!id) {
        return next(new AppError(400, "bad_request"));
      }

      const warehouse = await prisma.warehouse.findUnique({ where: { id } });
      if (!warehouse) {
        return next(new AppError(404, "warehause_not_found"));
      }
      if (!warehouse) {
        return next(new AppError(400, "warehouse_is_deleted"));
      }

      await prisma.warehouse.update({ where: { id }, data: { isActive: false } });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = warehouseController;
