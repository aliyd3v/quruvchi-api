const servicesController = require("../controllers/services.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { serviceCreateValidatorMiddleware } = require("../middlewares/validators/service/serviceCreateValidatorMiddleware");
const { serviceOrderCreateValidatorMiddleware } = require("../middlewares/validators/service/serviceOrderCreateValidatorMiddleware");
const { serviceSectionCreateValidatorMiddleware } = require("../middlewares/validators/service/serviceSectionCreateValidatorMiddleware");
const { serviceSectionUpdateValidatorMiddleware } = require("../middlewares/validators/service/serviceSectionUpdateValidatorMiddleware");
const { serviceUpdateValidatorMiddleware } = require("../middlewares/validators/service/serviceUpdateValidatorMiddleware");
const upload = require("../utils/multer");

const servicesRouter = require("express").Router();

servicesRouter
  .post("/", upload.single("image"), checkTokenMiddleware, serviceCreateValidatorMiddleware, servicesController.create)
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), servicesController.getList)
  .get("/projects-categories", servicesController.publicProjectsCategory)
  .get("/public", servicesController.publicList)
  .get("/public/:id", servicesController.getByIdPublic)
  .put("/section/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), serviceSectionUpdateValidatorMiddleware, servicesController.updateSection)
  .delete("/section/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), servicesController.deleteSection)
  .get("/trash", checkTokenMiddleware, checkRoleMiddleware(), servicesController.getTrash)
  .patch("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), servicesController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), servicesController.delete)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), servicesController.getById)
  .put("/:id", upload.single("image"), checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), serviceUpdateValidatorMiddleware, servicesController.update)
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), servicesController.softDelete)
  .post("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), serviceSectionCreateValidatorMiddleware, servicesController.createSection)
  .post("/:id/order", serviceOrderCreateValidatorMiddleware, servicesController.createOrder);

module.exports = { servicesRouter };
