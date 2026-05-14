const techsController = require("../controllers/techs.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { techsCreateValidatorMiddleware } = require("../middlewares/validators/techs/techsCreateValidatorMiddleware");
const { techsUpdateValidatorMiddleware } = require("../middlewares/validators/techs/techsUpdateValidatorMiddleware");
const upload = require("../utils/multer");

const techsRouter = require("express").Router();

techsRouter
  .post("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), upload.single("file"), techsCreateValidatorMiddleware, techsController.create)
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), techsController.getList)
  .get("/public", techsController.getPublicList)
  .get("/trash", checkTokenMiddleware, checkRoleMiddleware(), techsController.getTrash)
  .patch("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), techsController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), techsController.delete)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), techsController.getById)
  .put("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), upload.single("file"), techsUpdateValidatorMiddleware, techsController.update)
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), techsController.softDelete);

module.exports = { techsRouter };
