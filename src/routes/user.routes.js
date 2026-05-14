const userController = require("../controllers/user.controller");
const Permissions = require("../constants/PermissionEnum");
const { Role } = require("../generated/prisma");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { blockUserValidatorMiddleware } = require("../middlewares/validators/user/blockUserValidatorMiddleware");
const { changePasswordFromSAValidatorMiddleware } = require("../middlewares/validators/user/changePasswordFromSAValidatorMiddleware");
const { userCreateValidatorMiddleware } = require("../middlewares/validators/user/userCreateValidatorMiddleware");
const { userUpdateValidatorMiddleware } = require("../middlewares/validators/user/userUpdateValidatorMiddleware");
const { workerCreateToObjectValidatorMiddleware } = require("../middlewares/validators/user/workerCreateToObjectValidatorMiddleware");

const userRouter = require("express").Router();

userRouter
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.user_crud), userCreateValidatorMiddleware, userController.createOne)
  .get("/", checkPermissionMiddleware(Permissions.user_crud), userController.getAll)
  .get("/get-excel-doc", checkPermissionMiddleware(Permissions.user_crud), userController.getExcelDoc)
  .get("/search", checkPermissionMiddleware(Permissions.user_crud), userController.search)
  .get("/search-with-pagination", checkPermissionMiddleware(Permissions.user_crud), userController.searchWithPagination)
  .get("/search-with-sorted-by-role", userController.searchSortedByRole)
  .get("/name-search", userController.getOnlyNames)
  .get("/get-with-balance", checkPermissionMiddleware(Permissions.user_crud), userController.getUserWithBalance)
  .get("/get-with-balance/get-excel-doc", checkPermissionMiddleware(Permissions.user_crud), userController.getUserWithBalanceExcelDoc)
  .get("/admins", userController.getAdmins)
  .get("/workers", userController.getWorkers)
  .get("/filtered-by-role", userController.getFilteredByRole)
  .post("/worker-create-to-object/", checkPermissionMiddleware(Permissions.object_crud), workerCreateToObjectValidatorMiddleware, userController.createWorkerToObject)
  .delete("/worker-delete-from-object/:objectId/:workerId", checkPermissionMiddleware(Permissions.object_crud), userController.deleteWokerFromObject)
  .get("/trash", checkRoleMiddleware(Role.SUPERADMIN), userController.deactivatedUsers)
  .get("/trash/search", checkRoleMiddleware(Role.SUPERADMIN), userController.searchDeletedWithPagination)
  .patch("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), userController.activateOne)
  .delete("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), userController.absoluteDeleteOne)
  .get("/:id", checkPermissionMiddleware(Permissions.user_crud), userController.getOne)
  .get("/:id/transfers", userController.getUserTransfers)
  .get("/:id/given-spent-list", userController.getUserIncomeAndExpenditure)
  .get("/:id/user-balance-excel-doc", userController.getUserIncomeAndExpenditureExcelDoc)
  .put("/:id", checkPermissionMiddleware(Permissions.user_crud), userUpdateValidatorMiddleware, userController.updateOne)
  .patch("/:id/change-password", checkPermissionMiddleware(Permissions.user_crud), changePasswordFromSAValidatorMiddleware, userController.changePasswordUser)
  .delete("/:id", checkRoleMiddleware(Role.SUPERADMIN), checkPermissionMiddleware(Permissions.user_crud), userController.deactivateOne)
  .post("/:id/block", checkPermissionMiddleware(Permissions.user_blocks), blockUserValidatorMiddleware, userController.blockOne)
  .post("/:id/remove-block", checkPermissionMiddleware(Permissions.user_blocks), userController.removeBlock);

module.exports = { userRouter };
