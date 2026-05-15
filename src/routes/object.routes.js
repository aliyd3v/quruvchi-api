const objectController = require("../controllers/object.controller");
const Permissions = require("../constants/permission");
const { Role } = require("../generated/prisma");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { objectCreateValidationMiddleware } = require("../middlewares/validators/object/objectCreateValidationMiddleware");
const { objectStatusUpdateValidatorMiddleware } = require("../middlewares/validators/object/objectStatusUpdateValidatorMiddleware");
const { objectUpdateValidationMiddleware } = require("../middlewares/validators/object/objectUpdateValidationMiddleware");

const objectRouter = require("express").Router();

objectRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.object_crud), objectCreateValidationMiddleware, objectController.createOne)
  .get("/", checkPermission(Permissions.object_crud), objectController.getAll)
  .get("/get-excel-doc", checkPermission(Permissions.object_crud), objectController.getExcelDoc)
  .get("/get-names", objectController.getObjectNames)
  .get("/search-with-get-names", objectController.searchObjectNames)
  .get("/get-with-budgets", checkPermission(Permissions.salary_crud), objectController.getObjectsWithNameAndBudget)
  .get("/user-objects", objectController.getUserObjects)
  .get("/user-objects/search-with-get-names", objectController.searchUserObjectNames)
  .get("/user-objects/:id", objectController.getUserObject)
  .get("/user-objects/:id/txn-excel", objectController.getUserTxnExcel)
  .get("/user-objects/:id/transfers-excel", objectController.getUserTransfersExcel)
  .get("/trash", checkRole(Role.SUPERADMIN), objectController.deletedObjects)
  .patch("/trash/:id", checkRole(Role.SUPERADMIN), objectController.restoreDeleted)
  .delete("/trash/:id", checkRole(Role.SUPERADMIN), objectController.absoluteDelete)
  .get("/:id", checkPermission(Permissions.object_crud), objectController.getOne)
  .get("/:id/workers", checkRole(Role.SUPERADMIN, Role.ACCOUNTANT, Role.ADMIN), objectController.getObjectWorkers)
  .get("/:id/txn-excel", checkPermission(Permissions.object_crud), objectController.getTxnExcel)
  .get("/:id/transfers-excel", checkPermission(Permissions.object_crud), objectController.getTransfersExcel)
  .put("/:id", checkPermission(Permissions.object_crud), objectUpdateValidationMiddleware, objectController.updateOne)
  .patch("/:id", checkPermission(Permissions.object_crud), objectStatusUpdateValidatorMiddleware, objectController.changeStatus)
  .delete("/:id", checkPermission(Permissions.object_crud), objectController.deleteOne)
  .patch("/:objectId/:userId/remove", checkPermission(Permissions.object_crud), objectController.removeOneAssigned)
  .patch("/:objectId/:userId/add", checkPermission(Permissions.object_crud), objectController.addOneToAssignment);

module.exports = { objectRouter };
