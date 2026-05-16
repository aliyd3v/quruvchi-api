const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { idChecker } = require("../utils/idChecker");
const { Role } = require("../generated/prisma");
const fileService = require("../services/file.service");
const storage = require("../lib/storage");

const attachmentController = {
  async checkConnectionModelMiddleware(req, _res, next) {
    try {
      const filledKey = Object.keys(req.body)[0];
      const filledValueId = Number(Object.values(req.body)[0]);
      const modelForConnect = await prisma[filledKey.split("_")[0]].findUnique({ where: { id: filledValueId, isActive: true } });
      if (!modelForConnect) {
        await fileService.unlinkFiles(req.files);
        throw new AppError(404, "attachment_connection_model_not_found");
      }
      next();
    } catch (error) {
      await fileService.unlinkFiles(req.files);
      next(localErrorHandler(error));
    }
  },
  async createOne(req, res, next) {
    try {
      let filledKey = Object.keys(req.body)[0];
      const filledValueId = Number(Object.values(req.body)[0]);
      const uploadedFiles = req.uploadedFiles;
      switch (filledKey) {
        case "object_id":
          filledKey = "objectId";
          break;
        case "lot_id":
          filledKey = "lotId";
          break;
        case "transaction_id":
          filledKey = "transactionId";
          break;
        case "task_id":
          filledKey = "taskId";
          break;
        case "workVolume_id":
          filledKey = "workVolumeId";
          break;
      }
      const newAttachmentsData = uploadedFiles.map((u) => {
        return {
          [filledKey]: filledValueId,
          ...u,
          createdById: req.user.id,
        };
      });
      if (newAttachmentsData.length === 0) {
        return next(new AppError(400, "files_didnt_upload"));
      }
      await prisma.attachment.createMany({ data: newAttachmentsData });
      res.status(201).json({
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

      const attachment = await prisma.attachment.findUnique({ where: { id, isActive: true } });
      if (!attachment) {
        return next(new AppError(404, "attachment_not_found"));
      }

      if (attachment.createdById !== req.user.id && req.user.role !== Role.SUPERADMIN) {
        return next(new AppError(400, "you_are_not_owner_of_this_attachment"));
      }
      if (req.user.role !== Role.SUPERADMIN && Date.now() - new Date(attachment.createdAt).getTime() > 10 * 60 * 1000) {
        return next(new AppError(400, "allowed_time_for_delete_is_expired"));
      }

      await prisma.attachment.update({ where: { id }, data: { isActive: false, deletedById: req.user.id } });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
  async absoluteDeleteOne(req, res, next) {
    try {
      const id = idChecker(req.params.id);
      if (!id) {
        return next(new AppError(400, "bad_request"));
      }

      const attachment = await prisma.attachment.findFirst({ where: { id, isActive: false } });
      if (!attachment) {
        return next(new AppError(404, "attachment_not_found"));
      }

      await storage.delete(attachment.filename);
      await prisma.attachment.delete({ where: { id } });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = attachmentController;
