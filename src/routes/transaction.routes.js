const transactionController = require("../controllers/transaction.controller");
const upload = require("../utils/multer");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { transactionCreateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionCreateValidatorMiddleware");
const { transactionUpdateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionUpdateValidatorMiddleware");
const { incomeToObjectCreateValidatorMiddleware } = require("../middlewares/validators/transaction/incomeToObjectCreateValidatorMiddleware");
const { incomeToSelfCreateValidatorMiddleware } = require("../middlewares/validators/transaction/incomeToSelfCreateValidatorMiddleware");
const { transactionItemUpdateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionItemUpdateValidatorMiddleware");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const Permissions = require("../enums/PermissionEnum");
const { transactionItemCreateValidatorMiddleware } = require("../middlewares/validators/transaction/transactionItemCreateValidatorMiddleware");

const transactionRouter = require("express").Router();

transactionRouter
  .use(checkTokenMiddleware)
  .post("/", upload.array("files"), transactionCreateValidatorMiddleware, transactionController.createOne, uploadMultipleFiles, transactionController.uploadTransactionAttachment)
  .post("/income-to-object", checkPermissionMiddleware(Permissions.txn_crud), incomeToObjectCreateValidatorMiddleware, transactionController.incomeToObject)
  .post("/income-to-self", checkPermissionMiddleware(Permissions.txn_crud), incomeToSelfCreateValidatorMiddleware, transactionController.incomeToSelf)
  .get("/", checkPermissionMiddleware(Permissions.txn_crud), transactionController.getAll)
  .get("/get-excel-doc", checkPermissionMiddleware(Permissions.txn_crud), transactionController.getExcelDoc)
  .get("/get-excel-doc/:id", checkPermissionMiddleware(Permissions.txn_crud), transactionController.getTransactionItemsXLSX)
  .get("/trash", checkRoleMiddleware(Role.SUPERADMIN), transactionController.getDeleted)
  .patch("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), transactionController.restoreOne)
  .delete("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), transactionController.absoluteDelete)
  .get("/user-transactions", transactionController.getUserTransactions)
  .get("/user-transactions/get-excel-doc", transactionController.getUserTransactionsExcelDoc)
  .get("/user-transactions/:id", transactionController.getUserTransactionItems)
  .get("/user-transactions/get-excel-doc/:id", transactionController.getUserTransactionItemsXLSX)
  .put("/item/:id", checkPermissionMiddleware(Permissions.txn_crud), transactionItemUpdateValidatorMiddleware, transactionController.updateTxnItem)
  .post("/:id", checkPermissionMiddleware(Permissions.txn_crud), transactionItemCreateValidatorMiddleware, transactionController.addItem)
  .get("/:id", checkPermissionMiddleware(Permissions.txn_crud), transactionController.getTransactionItems)
  .patch("/:id/toggle-reviewed", checkRoleMiddleware(Role.SUPERADMIN), transactionController.toggleReviewed)
  .put("/:id", checkPermissionMiddleware(Permissions.txn_crud), transactionUpdateValidatorMiddleware, transactionController.updateOne)
  .delete("/:id", checkPermissionMiddleware(Permissions.txn_crud), transactionController.deleteOne);

module.exports = { transactionRouter };
