const projectsController = require("../controllers/projects.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { projectCreateValidatorMiddleware } = require("../middlewares/validators/projects/projectCreateValidatorMiddleware");
const { projectUpdateValidatorMiddleware } = require("../middlewares/validators/projects/projectUpdateValidatorMiddleware");
const upload = require("../utils/multer");

const projectsRouter = require("express").Router();

projectsRouter
  .post(
    "/",
    checkTokenMiddleware,
    checkPermissionMiddleware(Permissions.website_management),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    projectCreateValidatorMiddleware,
    projectsController.create,
  )
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), projectsController.getList)
  .delete("/gallery/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), projectsController.deleteGalleryItem)
  .get("/public", projectsController.getPublicList)
  .get("/public/:id", projectsController.getPublicById)
  .get("/trash", checkTokenMiddleware, checkRoleMiddleware(), projectsController.getTrash)
  .patch("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), projectsController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), projectsController.delete)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), projectsController.getById)
  .put(
    "/:id",
    checkTokenMiddleware,
    checkPermissionMiddleware(Permissions.website_management),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    projectUpdateValidatorMiddleware,
    projectsController.update,
  )
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), projectsController.softDelete);

module.exports = { projectsRouter };
