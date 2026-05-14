const attachmentController = require("../controllers/attachment.controller");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { attachmentCreateValidatorMiddleware } = require("../middlewares/validators/attachment/attachmentCreateValidatorMiddleware");
const upload = require("../utils/multer");

const attachmentRouter = require("express").Router();

attachmentRouter
  .use(checkTokenMiddleware)
  .post("/", upload.array("files"), attachmentCreateValidatorMiddleware, attachmentController.checkConnectionModelMiddleware, uploadMultipleFiles, attachmentController.createOne)
  .delete("/:id", attachmentController.deleteOne)
  .delete("/:id/absolute", checkRoleMiddleware(Role.SUPERADMIN), attachmentController.absoluteDeleteOne);

module.exports = { attachmentRouter };
