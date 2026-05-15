const catalogController = require("../controllers/catalog.controller");
const Permissions = require("../constants/permission");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
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
    checkToken,
    checkPermission(Permissions.catalog_crud),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    catalogCreateValidatorMiddleware,
    catalogController.create,
  )
  .get("/", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getAll)
  .post("/direction", checkToken, checkPermission(Permissions.catalog_crud), upload.single("file"), catalogDirectionCreateValidatorMiddleware, catalogController.createDirection)
  .get("/direction", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getDirectionsList)
  .get("/direction/public", catalogController.getPublicDirectionsList)
  .get("/direction/search", checkToken, checkPermission(Permissions.catalog_crud), catalogController.searchDirection)
  .get("/direction/trash", checkToken, checkRole(), catalogController.getDirectionTrash)
  .patch("/direction/trash/:id", checkToken, checkRole(), catalogController.restoreDirection)
  .delete("/direction/trash/:id", checkToken, checkRole(), catalogController.deleteDirection)
  .get("/direction/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getOneDirection)
  .put("/direction/:id", checkToken, checkPermission(Permissions.catalog_crud), upload.single("file"), catalogDirectionUpdateValidatorMiddleware, catalogController.updateDirection)
  .delete("/direction/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.softDeleteDirection)
  .get("/excel-doc", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getCatalogExcel)
  .delete("/gallery/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.deleteGalleryItem)
  .put("/item/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogItemUpdateValidatorMiddleware, catalogController.updateItem)
  .delete("/item/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.softDeleteItem)
  .post("/material", checkToken, checkPermission(Permissions.catalog_crud), catalogMaterialCreateValidatorMiddleware, catalogController.createMaterial)
  .get("/material", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getMaterialsList)
  .get("/material/search", checkToken, checkPermission(Permissions.catalog_crud), catalogController.searchMaterial)
  .get("/material/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getMaterialById)
  .put("/material/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogMaterialUpdateValidatorMiddleware, catalogController.updateMaterial)
  .delete("/material/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.softDeleteMaterial)
  .get("/public", catalogController.getPublicList)
  .get("/public/:id", catalogController.getPublicById)
  .get("/trash", checkToken, checkRole(), catalogController.getCatalogTrash)
  .get("/trash/material", checkToken, checkRole(), catalogController.getCatalogMaterialTrash)
  .patch("/trash/material/:id", checkToken, checkRole(), catalogController.restoreMaterial)
  .delete("/trash/material/:id", checkToken, checkRole(), catalogController.deleteMaterial)
  .patch("/trash/:id", checkToken, checkRole(), catalogController.restore)
  .delete("/trash/:id", checkToken, checkRole(), catalogController.delete)
  .get("/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getById)
  .put(
    "/:id",
    checkToken,
    checkPermission(Permissions.catalog_crud),
    upload.fields([
      { name: "file", maxCount: 1 },
      { name: "files", maxCount: 8 },
    ]),
    catalogUpdateValidatorMiddleware,
    catalogController.update,
  )
  .delete("/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogController.softDelete)
  .post("/:id", checkToken, checkPermission(Permissions.catalog_crud), catalogCreateItemValidatorMiddleware, catalogController.createItem)
  .get("/:id/excel-doc", checkToken, checkPermission(Permissions.catalog_crud), catalogController.getCatalogItemExcel)
  .post("/:id/order", catalogOrderCreateValidatrionMiddleware, catalogController.createOrder);

module.exports = { catalogRouter };
