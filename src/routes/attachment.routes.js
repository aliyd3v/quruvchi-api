const attachmentController = require("../controllers/attachment.controller");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { attachmentCreateValidatorMiddleware } = require("../middlewares/validators/attachment/attachmentCreateValidatorMiddleware");
const upload = require("../utils/multer");

const attachmentRouter = require("express").Router();

attachmentRouter
  .use(checkToken)
  .post("/", upload.array("files"), attachmentCreateValidatorMiddleware, attachmentController.checkConnectionModelMiddleware, uploadMultipleFiles, attachmentController.createOne)
  .delete("/:id", attachmentController.deleteOne)
  .delete("/:id/absolute", checkRole(Role.SUPERADMIN), attachmentController.absoluteDeleteOne);

module.exports = { attachmentRouter };
