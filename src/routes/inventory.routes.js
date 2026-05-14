const inventoryController = require("../controllers/inventory.controller");
const Permissions = require("../enums/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { inventoryCreateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryCreateValidatorMiddleware");
const { inventoryHistoryCreateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryHistoryCreateValidatorMiddleware");
const { inventoryHistoryUpdateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryHistoryUpdateValidatorMiddleware");
const { inventoryUpdateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryUpdateValidatorMiddleware");
const inventoryRouter = require("express").Router();
const upload = require("../utils/multer");

inventoryRouter
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.warehouse_crud), upload.array("files"), inventoryCreateValidatorMiddleware, inventoryController.createOne)
  .get("/", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getAll)
  .get("/search", inventoryController.searchInventory)
  .get("/get-excel-doc", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getExcelDoc)
  .get("/histories", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getHistories)
  .get("/histories/excel-doc", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getHistoriesExcel)
  .get("/user-histories", inventoryController.getUserHistories)
  .get("/user-histories/excel-doc", inventoryController.getUserHistoriesExcelDoc)
  .get("/staff-version", inventoryController.getAllStaffVersion)
  .get("/staff-version/:id", inventoryController.getOneStaffVersion)
  .put("/history/:id", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryHistoryUpdateValidatorMiddleware, inventoryController.updateOneHistory)
  .delete("/history/:id", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.deleteOneHistory)
  .get("/trash", checkRoleMiddleware(), inventoryController.getTrash)
  .patch("/trash/:id", checkRoleMiddleware(), inventoryController.restoreOne)
  .delete("/trash/:id", checkRoleMiddleware(), inventoryController.absoluteDelete)
  .get("/histories-trash", checkRoleMiddleware(), inventoryController.getDeletedHistories)
  .patch("/histories-trash/:id", checkRoleMiddleware(), inventoryController.restoreOneHistory)
  .delete("/histories-trash/:id", checkRoleMiddleware(), inventoryController.absoluteDeleteHistory)
  .get("/:id", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getOne)
  .get("/:id/get-excel-doc", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getOneExcelDoc)
  .get("/:id/batches", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.getBatches)
  .post("/:id", checkPermissionMiddleware(Permissions.warehouse_crud), upload.array("files"), inventoryHistoryCreateValidatorMiddleware, inventoryController.createHistory)
  .put("/:id", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryUpdateValidatorMiddleware, inventoryController.updateOne)
  .delete("/:id", checkPermissionMiddleware(Permissions.warehouse_crud), inventoryController.deleteOne);

module.exports = { inventoryRouter };
