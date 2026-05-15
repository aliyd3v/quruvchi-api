const transactionController = require("../controllers/transaction.controller");
const upload = require("../utils/multer");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { transactionCreateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionCreateValidatorMiddleware");
const { transactionUpdateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionUpdateValidatorMiddleware");
const { incomeToObjectCreateValidatorMiddleware } = require("../middlewares/validators/transaction/incomeToObjectCreateValidatorMiddleware");
const { incomeToSelfCreateValidatorMiddleware } = require("../middlewares/validators/transaction/incomeToSelfCreateValidatorMiddleware");
const { transactionItemUpdateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionItemUpdateValidatorMiddleware");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { checkPermission } = require("../middlewares/checkPermission");
const Permissions = require("../constants/permission");
const { transactionItemCreateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionItemCreateValidatorMiddleware");

const transactionRouter = require("express").Router();

transactionRouter
  .use(checkToken)
  .post("/", upload.array("files"), transactionCreateValidatorMiddleware, transactionController.createOne, uploadMultipleFiles, transactionController.uploadTransactionAttachment)
  .post("/income-to-object", checkPermission(Permissions.txn_crud), incomeToObjectCreateValidatorMiddleware, transactionController.incomeToObject)
  .post("/income-to-self", checkPermission(Permissions.txn_crud), incomeToSelfCreateValidatorMiddleware, transactionController.incomeToSelf)
  .get("/", checkPermission(Permissions.txn_crud), transactionController.getAll)
  .get("/get-excel-doc", checkPermission(Permissions.txn_crud), transactionController.getExcelDoc)
  .get("/get-excel-doc/:id", checkPermission(Permissions.txn_crud), transactionController.getTransactionItemsXLSX)
  .get("/trash", checkRole(Role.SUPERADMIN), transactionController.getDeleted)
  .patch("/trash/:id", checkRole(Role.SUPERADMIN), transactionController.restoreOne)
  .delete("/trash/:id", checkRole(Role.SUPERADMIN), transactionController.absoluteDelete)
  .get("/user-transactions", transactionController.getUserTransactions)
  .get("/user-transactions/get-excel-doc", transactionController.getUserTransactionsExcelDoc)
  .get("/user-transactions/:id", transactionController.getUserTransactionItems)
  .get("/user-transactions/get-excel-doc/:id", transactionController.getUserTransactionItemsXLSX)
  .put("/item/:id", checkPermission(Permissions.txn_crud), transactionItemUpdateValidatorMiddleware, transactionController.updateTxnItem)
  .post("/:id", checkPermission(Permissions.txn_crud), transactionItemCreateValidatorMiddleware, transactionController.addItem)
  .get("/:id", checkPermission(Permissions.txn_crud), transactionController.getTransactionItems)
  .patch("/:id/toggle-reviewed", checkRole(Role.SUPERADMIN), transactionController.toggleReviewed)
  .put("/:id", checkPermission(Permissions.txn_crud), transactionUpdateValidatorMiddleware, transactionController.updateOne)
  .delete("/:id", checkPermission(Permissions.txn_crud), transactionController.deleteOne);

module.exports = { transactionRouter };
