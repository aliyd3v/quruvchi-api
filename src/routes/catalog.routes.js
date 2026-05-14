const catalogController = require("../controllers/catalog.controller");
const Permissions = require("../constants/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { catalogCreateValidatorMiddleware } = require("../middlewares/validators/catalog/catalogCreateValidatorMiddleware");
const { catalogCreateItemValidatorMiddleware } = require("../middlewares/validators/catalog/catalogItemCreateValidatorMiddleware");
const { catalogItemUpdateValidatorMiddleware } = require("../middlewares/validators/catalog/catalogItemUpdateValidatorMiddleware");
const { catalogMaterialCreateValidatorMiddleware } = require("../middlewares/validators/catalog/catalogMaterialCreateValidatorMiddleware");
const { catalogMaterialUpdateValidatorMiddleware } = require("../middlewares/validators/catalog/catalogMaterialUpdateValidatorMiddleware");
const { catalogOrderCreateValidatrionMiddleware } = require("../middlewares/validators/catalog/catalogOrderCreateValidatrionMiddleware");
const { catalogUpdateValidatorMiddleware } = require("../middlewares/validators/catalog/catalogUpdateValidatorMiddleware");
const { catalogDirectionCreateValidatorMiddleware } = require("../middlewares/validators/catalogDirection/catalogDirectionCreateValidationMiddleware");
const { catalogDirectionUpdateValidatorMiddleware } = require("../middlewares/validators/catalogDirection/catalogDirectionUpdateValidateMiddleware");
const upload = require("../utils/multer");

const catalogRouter = require("express").Router();

catalogRouter
  .post(
    "/",
    checkTokenMiddleware,
    checkPermissionMiddleware(Permissions.catalog_crud),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    catalogCreateValidatorMiddleware,
    catalogController.create,
  )
  .get("/", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getAll)
  .post("/direction", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), upload.single("file"), catalogDirectionCreateValidatorMiddleware, catalogController.createDirection)
  .get("/direction", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getDirectionsList)
  .get("/direction/public", catalogController.getPublicDirectionsList)
  .get("/direction/search", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.searchDirection)
  .get("/direction/trash", checkTokenMiddleware, checkRoleMiddleware(), catalogController.getDirectionTrash)
  .patch("/direction/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), catalogController.restoreDirection)
  .delete("/direction/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), catalogController.deleteDirection)
  .get("/direction/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getOneDirection)
  .put("/direction/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), upload.single("file"), catalogDirectionUpdateValidatorMiddleware, catalogController.updateDirection)
  .delete("/direction/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.softDeleteDirection)
  .get("/excel-doc", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getCatalogExcel)
  .delete("/gallery/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.deleteGalleryItem)
  .put("/item/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogItemUpdateValidatorMiddleware, catalogController.updateItem)
  .delete("/item/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.softDeleteItem)
  .post("/material", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogMaterialCreateValidatorMiddleware, catalogController.createMaterial)
  .get("/material", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getMaterialsList)
  .get("/material/search", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.searchMaterial)
  .get("/material/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getMaterialById)
  .put("/material/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogMaterialUpdateValidatorMiddleware, catalogController.updateMaterial)
  .delete("/material/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.softDeleteMaterial)
  .get("/public", catalogController.getPublicList)
  .get("/public/:id", catalogController.getPublicById)
  .get("/trash", checkTokenMiddleware, checkRoleMiddleware(), catalogController.getCatalogTrash)
  .get("/trash/material", checkTokenMiddleware, checkRoleMiddleware(), catalogController.getCatalogMaterialTrash)
  .patch("/trash/material/:id", checkTokenMiddleware, checkRoleMiddleware(), catalogController.restoreMaterial)
  .delete("/trash/material/:id", checkTokenMiddleware, checkRoleMiddleware(), catalogController.deleteMaterial)
  .patch("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), catalogController.restore)
  .delete("/trash/:id", checkTokenMiddleware, checkRoleMiddleware(), catalogController.delete)
  .get("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getById)
  .put(
    "/:id",
    checkTokenMiddleware,
    checkPermissionMiddleware(Permissions.catalog_crud),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    catalogUpdateValidatorMiddleware,
    catalogController.update,
  )
  .delete("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.softDelete)
  .post("/:id", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogCreateItemValidatorMiddleware, catalogController.createItem)
  .get("/:id/excel-doc", checkTokenMiddleware, checkPermissionMiddleware(Permissions.catalog_crud), catalogController.getCatalogItemExcel)
  .post("/:id/order", catalogOrderCreateValidatrionMiddleware, catalogController.createOrder);

module.exports = { catalogRouter };
