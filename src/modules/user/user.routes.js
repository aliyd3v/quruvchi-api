const userController = require("./user.controller");
const Permissions = require("../../constants/permission");
const { Role } = require("../../generated/prisma");
const { checkPermission } = require("../../middlewares/checkPermission");
const { checkRole } = require("../../middlewares/checkRole");
const { checkToken } = require("../../middlewares/checkToken");
const validate = require("../../middlewares/validate");
const { userCreateDto, workerCreateToObjectDto, changeUserPasswordDto, blockUserDto, userUpdateDto } = require("./user.validation");

const userRouter = require("express").Router();

userRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.user_crud), validate({ dto: userCreateDto }), userController.createOne)
  .get("/", checkPermission(Permissions.user_crud), userController.getList)
  .get("/get-excel-doc", checkPermission(Permissions.user_crud), userController.getExcelDoc)
  .get("/search", checkPermission(Permissions.user_crud), userController.search)
  .get("/search-with-sorted-by-role", userController.searchSortedByRole)
  .get("/name-search", userController.getOnlyNames)
  .get("/get-with-balance", checkPermission(Permissions.user_crud), userController.getUserWithBalance)
  .get("/get-with-balance/get-excel-doc", checkPermission(Permissions.user_crud), userController.getUserWithBalanceExcelDoc)
  .get("/admins", userController.getAdmins)
  .get("/workers", userController.getWorkers)
  .get("/filtered-by-role", userController.getFilteredByRole)
  .post("/worker-create-to-object/", checkPermission(Permissions.object_crud), validate({ dto: workerCreateToObjectDto }), userController.createWorkerToObject)
  .delete("/worker-delete-from-object/:objectId/:workerId", checkPermission(Permissions.object_crud), userController.deleteWokerFromObject)
  .get("/trash", checkRole(Role.SUPERADMIN), userController.trashList)
  .get("/trash/search", checkRole(Role.SUPERADMIN), userController.searchDeletedWithPagination)
  .patch("/trash/:id", checkRole(Role.SUPERADMIN), userController.restore)
  .delete("/trash/:id", checkRole(Role.SUPERADMIN), userController.delete)
  .get("/:id", checkPermission(Permissions.user_crud), userController.getById)
  .get("/:id/transfers", userController.getUserTransfers)
  .get("/:id/given-spent-list", userController.getUserIncomeAndExpenditure)
  .get("/:id/user-balance-excel-doc", userController.getUserIncomeAndExpenditureExcelDoc)
  .put("/:id", checkPermission(Permissions.user_crud), validate({ dto: userUpdateDto }), userController.update)
  .patch("/:id/change-password", checkPermission(Permissions.user_crud), validate({ dto: changeUserPasswordDto }), userController.changePasswordUser)
  .delete("/:id", checkRole(Role.SUPERADMIN), checkPermission(Permissions.user_crud), userController.softDelete)
  .post("/:id/block", checkPermission(Permissions.user_blocks), validate({ dto: blockUserDto }), userController.block)
  .post("/:id/remove-block", checkPermission(Permissions.user_blocks), userController.removeBlock);

module.exports = { userRouter };
