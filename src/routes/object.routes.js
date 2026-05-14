const objectController = require("../controllers/object.controller");
const Permissions = require("../enums/PermissionEnum");
const { Role } = require("../generated/prisma");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { objectCreateValidationMiddleware } = require("../middlewares/validators/object/objectCreateValidationMiddleware");
const { objectStatusUpdateValidatorMiddleware } = require("../middlewares/validators/object/objectStatusUpdateValidatorMiddleware");
const { objectUpdateValidationMiddleware } = require("../middlewares/validators/object/objectUpdateValidationMiddleware");

const objectRouter = require("express").Router();

objectRouter
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.object_crud), objectCreateValidationMiddleware, objectController.createOne)
  .get("/", checkPermissionMiddleware(Permissions.object_crud), objectController.getAll)
  .get("/get-excel-doc", checkPermissionMiddleware(Permissions.object_crud), objectController.getExcelDoc)
  .get("/get-names", objectController.getObjectNames)
  .get("/search-with-get-names", objectController.searchObjectNames)
  .get("/get-with-budgets", checkPermissionMiddleware(Permissions.salary_crud), objectController.getObjectsWithNameAndBudget)
  .get("/user-objects", objectController.getUserObjects)
  .get("/user-objects/search-with-get-names", objectController.searchUserObjectNames)
  .get("/user-objects/:id", objectController.getUserObject)
  .get("/user-objects/:id/txn-excel", objectController.getUserTxnExcel)
  .get("/user-objects/:id/transfers-excel", objectController.getUserTransfersExcel)
  .get("/trash", checkRoleMiddleware(Role.SUPERADMIN), objectController.deletedObjects)
  .patch("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), objectController.restoreDeleted)
  .delete("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), objectController.absoluteDelete)
  .get("/:id", checkPermissionMiddleware(Permissions.object_crud), objectController.getOne)
  .get("/:id/workers", checkRoleMiddleware(Role.SUPERADMIN, Role.ACCOUNTANT, Role.ADMIN), objectController.getObjectWorkers)
  .get("/:id/txn-excel", checkPermissionMiddleware(Permissions.object_crud), objectController.getTxnExcel)
  .get("/:id/transfers-excel", checkPermissionMiddleware(Permissions.object_crud), objectController.getTransfersExcel)
  .put("/:id", checkPermissionMiddleware(Permissions.object_crud), objectUpdateValidationMiddleware, objectController.updateOne)
  .patch("/:id", checkPermissionMiddleware(Permissions.object_crud), objectStatusUpdateValidatorMiddleware, objectController.changeStatus)
  .delete("/:id", checkPermissionMiddleware(Permissions.object_crud), objectController.deleteOne)
  .patch("/:objectId/:userId/remove", checkPermissionMiddleware(Permissions.object_crud), objectController.removeOneAssigned)
  .patch("/:objectId/:userId/add", checkPermissionMiddleware(Permissions.object_crud), objectController.addOneToAssignment);

module.exports = { objectRouter };
