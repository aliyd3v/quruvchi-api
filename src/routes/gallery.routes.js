const galleryController = require("../controllers/gallery.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { galleryCreateValidatorMiddleware } = require("../middlewares/validators/gallery/galleryCreateValidatorMiddleware");
const upload = require("../utils/multer");

const galleryRouter = require("express").Router();

galleryRouter
  .post("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), upload.single("file"), galleryCreateValidatorMiddleware, galleryController.create)
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), galleryController.getList)
  .get("/public", galleryController.getPublic)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), galleryController.getById)
  .put("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), upload.single("file"), galleryCreateValidatorMiddleware, galleryController.update)
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), galleryController.softDelete);

module.exports = { galleryRouter };
