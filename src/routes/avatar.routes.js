const avatarController = require("../controllers/avatar.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { uploadSingleFile } = require("../middlewares/uploadToStorageMiddleware");
const { imageValidatorMiddleware } = require("../middlewares/validators/avatar/imageValidatorMiddleware");
const upload = require("../utils/multer");

const avatarRouter = require("express").Router();

avatarRouter
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.update_profile), upload.single("file"), imageValidatorMiddleware, uploadSingleFile, avatarController.createOne)
  .delete("/", checkPermissionMiddleware(Permissions.update_profile), avatarController.deleteOne);

module.exports = { avatarRouter };
