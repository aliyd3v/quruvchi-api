const prisma = require("../services/prisma");
const AppError = require("../utils/AppError");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { deleteFileFromS3, cleanupLocalFiles } = require("../utils/s3");

const avatarController = {
  async createOne(req, res, next) {
    try {
      const uploadedFile = req.uploadedFile;
      if (!uploadedFile) throw new AppError(400, "profile_image_cannot_be_empty");

      if (req.user.avatar) {
        await deleteFileFromS3(req.user.avatar.filename);
        try {
          await prisma.avatar.delete({ where: { userId: req.user.id } });
        } catch (error) {
          console.log(error);
        }
      }

      const newAvatar = await prisma.avatar.create({
        data: { filename: uploadedFile.filename, size: uploadedFile.size, url: uploadedFile.url, userId: req.user.id },
        select: { url: true },
      });

      res.status(201).json({
        status: "success",
        data: newAvatar.url,
      });
    } catch (error) {
      await cleanupLocalFiles(req.file);
      next(localErrorHandler(error));
    }
  },

  async deleteOne(req, res, next) {
    try {
      const avatar = req.user.avatar;
      if (!avatar) throw new AppError(404, "you_have_not_profile_image");

      await deleteFileFromS3(avatar.filename);

      try {
        await prisma.avatar.delete({ where: { userId: req.user.id } });
      } catch (error) {
        console.log(error);
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = avatarController;
