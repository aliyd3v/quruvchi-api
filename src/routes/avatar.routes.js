const avatarController = require("../controllers/avatar.controller");
const Permissions = require("../constants/permission");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkToken } = require("../middlewares/checkToken");
const { uploadSingleFile } = require("../middlewares/uploadToStorageMiddleware");
const { imageValidatorMiddleware } = require("../middlewares/validators/avatar/imageValidatorMiddleware");
const upload = require("../utils/multer");

const avatarRouter = require("express").Router();

avatarRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.update_profile), upload.single("file"), imageValidatorMiddleware, uploadSingleFile, avatarController.createOne)
  .delete("/", checkPermission(Permissions.update_profile), avatarController.deleteOne);

module.exports = { avatarRouter };
