const inventoryController = require("../controllers/inventory.controller");
const Permissions = require("../constants/permission");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { inventoryCreateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryCreateValidatorMiddleware");
const { inventoryHistoryCreateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryHistoryCreateValidatorMiddleware");
const { inventoryHistoryUpdateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryHistoryUpdateValidatorMiddleware");
const { inventoryUpdateValidatorMiddleware } = require("../middlewares/validators/inventory/inventoryUpdateValidatorMiddleware");
const inventoryRouter = require("express").Router();
const upload = require("../utils/multer");

inventoryRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.warehouse_crud), upload.array("files"), inventoryCreateValidatorMiddleware, inventoryController.createOne)
  .get("/", checkPermission(Permissions.warehouse_crud), inventoryController.getAll)
  .get("/search", inventoryController.searchInventory)
  .get("/get-excel-doc", checkPermission(Permissions.warehouse_crud), inventoryController.getExcelDoc)
  .get("/histories", checkPermission(Permissions.warehouse_crud), inventoryController.getHistories)
  .get("/histories/excel-doc", checkPermission(Permissions.warehouse_crud), inventoryController.getHistoriesExcel)
  .get("/user-histories", inventoryController.getUserHistories)
  .get("/user-histories/excel-doc", inventoryController.getUserHistoriesExcelDoc)
  .get("/staff-version", inventoryController.getAllStaffVersion)
  .get("/staff-version/:id", inventoryController.getOneStaffVersion)
  .put("/history/:id", checkPermission(Permissions.warehouse_crud), inventoryHistoryUpdateValidatorMiddleware, inventoryController.updateOneHistory)
  .delete("/history/:id", checkPermission(Permissions.warehouse_crud), inventoryController.deleteOneHistory)
  .get("/trash", checkRole(), inventoryController.getTrash)
  .patch("/trash/:id", checkRole(), inventoryController.restoreOne)
  .delete("/trash/:id", checkRole(), inventoryController.absoluteDelete)
  .get("/histories-trash", checkRole(), inventoryController.getDeletedHistories)
  .patch("/histories-trash/:id", checkRole(), inventoryController.restoreOneHistory)
  .delete("/histories-trash/:id", checkRole(), inventoryController.absoluteDeleteHistory)
  .get("/:id", checkPermission(Permissions.warehouse_crud), inventoryController.getOne)
  .get("/:id/get-excel-doc", checkPermission(Permissions.warehouse_crud), inventoryController.getOneExcelDoc)
  .get("/:id/batches", checkPermission(Permissions.warehouse_crud), inventoryController.getBatches)
  .post("/:id", checkPermission(Permissions.warehouse_crud), upload.array("files"), inventoryHistoryCreateValidatorMiddleware, inventoryController.createHistory)
  .put("/:id", checkPermission(Permissions.warehouse_crud), inventoryUpdateValidatorMiddleware, inventoryController.updateOne)
  .delete("/:id", checkPermission(Permissions.warehouse_crud), inventoryController.deleteOne);

module.exports = { inventoryRouter };
