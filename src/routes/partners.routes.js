const partnersController = require("../controllers/partners.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { partnerCreateValidatorMiddleware } = require("../middlewares/validators/partners/partnerCreateValidatorMiddleware");
const { partnerUpdateValidatorMiddleware } = require("../middlewares/validators/partners/partnerUpdateValidatorMiddleware");
const upload = require("../utils/multer");

const partnersRouter = require("express").Router();

partnersRouter
  .post("/", checkTokenMiddleware, checkRoleMiddleware(Permissions.website_management), upload.single("file"), partnerCreateValidatorMiddleware, partnersController.create)
  .get("/", checkTokenMiddleware, checkRoleMiddleware(Permissions.website_management), partnersController.getList)
  .get("/public", partnersController.getPublicList)
  .get("/trash", checkTokenMiddleware, checkPermissionMiddleware(), partnersController.getTrash)
  .patch("/trash/:id", checkTokenMiddleware, checkPermissionMiddleware(), partnersController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkPermissionMiddleware(), partnersController.delete)
  .get("/:id", checkTokenMiddleware, checkRoleMiddleware(Permissions.website_management), partnersController.getById)
  .put("/:id", checkTokenMiddleware, checkRoleMiddleware(Permissions.website_management), upload.single("file"), partnerUpdateValidatorMiddleware, partnersController.update)
  .delete("/:id", checkTokenMiddleware, checkRoleMiddleware(Permissions.website_management), partnersController.softDelete);

module.exports = { partnersRouter };
