const inboxController = require("../controllers/inbox.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { inboxStatusChangeValidatorMiddleware } = require("../middlewares/validators/inbox/inboxStatusChangeValidatorMiddleware");

const inboxRouter = require("express").Router();

inboxRouter
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), inboxController.getList)
  .get("/trash", checkTokenMiddleware, checkRoleMiddleware(), inboxController.getTrash)
  .patch("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), inboxController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), inboxController.delete)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), inboxController.getById)
  .patch("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), inboxStatusChangeValidatorMiddleware, inboxController.changeStatus)
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), inboxController.softDelete);

module.exports = { inboxRouter };
