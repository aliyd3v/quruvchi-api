const newsController = require("../controllers/news.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { newsCreateValidatorMiddleware } = require("../middlewares/validators/news/newsCreateValidatorMiddleware");
const { newsUpdateValidatorMiddleware } = require("../middlewares/validators/news/newsUpdateValidatorMiddleware");
const upload = require("../utils/multer");

const newsRouter = require("express").Router();

newsRouter
  .post(
    "/",
    checkTokenMiddleware,
    checkPermissionMiddleware(Permissions.website_management),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    newsCreateValidatorMiddleware,
    newsController.create,
  )
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), newsController.getList)
  .delete("/gallery/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), newsController.deleteGalleryItem)
  .get("/public", newsController.getPublicList)
  .get("/public/:id", newsController.getPublicById)
  .get("/trash", checkTokenMiddleware, checkPermissionMiddleware(), newsController.getTrash)
  .patch("/trash/:id", checkTokenMiddleware, checkPermissionMiddleware(), newsController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkPermissionMiddleware(), newsController.delete)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), newsController.getById)
  .put(
    "/:id",
    checkTokenMiddleware,
    checkPermissionMiddleware(Permissions.website_management),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    newsUpdateValidatorMiddleware,
    newsController.update,
  )
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.website_management), newsController.softDelete);

module.exports = { newsRouter };
