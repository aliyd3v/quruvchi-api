const prisma = require("../services/prisma");
const { toMinor, toMajor } = require("../utils/amount");
const AppError = require("../utils/AppError");
const { idChecker } = require("../utils/idChecker");
const { localErrorHandler } = require("../utils/localErrorHandler");

const workVolumeController = {
  async createOne(req, res, next) {
    try {
      const object = await prisma.object.findFirst({ where: { id: req.body.object_id, isActive: true } });
      if (!object) {
        return next(new AppError(404, "object_not_found"));
      }

      const quantity = req.body.quantity;
      let unitPrice = req.body.unit_price;
      let totalAmount = BigInt(Math.floor(Number(unitPrice) * quantity));

      await prisma.workVolume.create({
        data: {
          objectId: object.id,
          title: req.body.title,
          description: req.body.description,
          quantity,
          unit: req.body.unit,
          unitPrice,
          totalAmount,
          createdById: req.user.id,
        },
      });

      res.status(201).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getAll(_req, res, next) {
    try {
      const workVolumes = await prisma.workVolume.findMany({
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalAmount: true,
          spentAmount: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
              createdAt: true,
            },
          },
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      const result = workVolumes.map((wv) => ({
        ...wv,
        unitPrice: Number(wv.unitPrice) !== 0 ? Number(wv.unitPrice) / 100 : 0,
        totalAmount: Number(wv.totalAmount) !== 0 ? Number(wv.totalAmount) / 100 : 0,
        spentAmount: Number(wv.spentAmount) !== 0 ? Number(wv.spentAmount) / 100 : 0,
      }));
      res.status(200).json({
        status: "success",
        data: result,
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
      const workVolume = await prisma.workVolume.findUnique({
        where: { id, isActive: true },
        select: {
          id: true,
          title: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalAmount: true,
          spentAmount: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
              createdAt: true,
            },
          },
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!workVolume) {
        return next(new AppError(404, "work_volume_not_found"));
      }
      res.status(200).json({
        status: "success",
        data: {
          ...workVolume,
          unitPrice: Number(workVolume.unitPrice) !== 0 ? Number(workVolume.unitPrice) / 100 : 0,
          totalAmount: Number(workVolume.totalAmount) !== 0 ? Number(workVolume.totalAmount) / 100 : 0,
          spentAmount: Number(workVolume.spentAmount) !== 0 ? Number(workVolume.spentAmount) / 100 : 0,
        },
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

      const workVolume = await prisma.workVolume.findUnique({
        where: { id, isActive: true },
        select: {
          id: true,
          title: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalAmount: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
              createdAt: true,
            },
          },
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!workVolume) {
        return next(new AppError(404, "work_volume_not_found"));
      }

      const object = await prisma.object.findUnique({ where: { id: req.body.object_id, isActive: true } });
      if (!object) {
        return next(new AppError(404, "object_not_found"));
      }

      const quantity = req.body.quantity;
      const unitPrice = req.body.unit_price;
      const totalAmount = BigInt(Math.floor(Number(unitPrice) * quantity));

      await prisma.workVolume.update({
        where: { id },
        data: {
          objectId: object.id,
          title: req.body.title,
          description: req.body.description,
          quantity,
          unit: req.body.unit,
          unitPrice,
          totalAmount,
          createdById: req.user.id,
        },
      });

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
      // Check for existence.
      const workVolume = await prisma.workVolume.findUnique({
        where: { id, isActive: true },
      });
      if (!workVolume) {
        return next(new AppError(404, "work_volume_not_found"));
      }
      await prisma.workVolume.update({
        where: { id, isActive: true },
        data: { isActive: false, deletedById: req.user.id },
      });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async getDeleted(_req, res, next) {
    try {
      const workVolumes = await prisma.workVolume.findMany({
        where: { isActive: false },
        select: {
          id: true,
          title: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          totalAmount: true,
          spentAmount: true,
          createdBy: {
            select: {
              id: true,
              fname: true,
              lname: true,
              email: true,
              phone: true,
              role: true,
              avatar: true,
              createdAt: true,
            },
          },
          object: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              description: true,
              status: true,
              startDate: true,
              endDate: true,
              createdAt: true,
            },
          },
          deletedBy: {
            where: { isActive: true },
            select: {
              id: true,
              fname: true,
              lname: true,
              phone: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });
      const result = workVolumes.map((wv) => ({
        ...wv,
        unitPrice: Number(wv.unitPrice) !== 0 ? Number(wv.unitPrice) / 100 : 0,
        totalAmount: Number(wv.totalAmount) !== 0 ? Number(wv.totalAmount) / 100 : 0,
        spentAmount: Number(wv.spentAmount) !== 0 ? Number(wv.spentAmount) / 100 : 0,
      }));
      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async restoreOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) {
        return next(new AppError(400, "bad_request"));
      }
      const workVolume = await prisma.workVolume.findUnique({
        where: { isActive: false, id },
        select: { id: true },
      });
      if (!workVolume) {
        return next(new AppError(404, "work_volume_not_found"));
      }
      await prisma.workVolume.update({ where: { isActive: false, id }, data: { isActive: true, deletedById: null } });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async absoluteDelete(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) {
        return next(new AppError(400, "bad_request"));
      }
      const workVolume = await prisma.workVolume.findUnique({
        where: { isActive: false, id },
        select: { id: true },
      });
      if (!workVolume) {
        return next(new AppError(404, "work_volume_not_found"));
      }
      await prisma.workVolume.delete({ where: { isActive: false, id } });
      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async searchDeleted(_req, res, next) {
    try {
      res.status(200).json({
        status: "success",
        data: null,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = workVolumeController;
