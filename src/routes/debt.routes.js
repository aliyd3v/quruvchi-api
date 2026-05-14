const debtController = require("../controllers/debt.controller");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const Permissions = require("../enums/PermissionEnum");
const { debtCreateValidatorMiddleware } = require("../middlewares/validators/debt/debtCreateValidatorMiddleware");
const { debtUpdateValidatorMidlleware } = require("../middlewares/validators/debt/debtUpdateValidatorMidlleware");
const { transactionCreateValidator, transactionUpdateValidator } = require("../middlewares/validators/debt/transactionValidator");
const { itemCreateValidator, itemUpdateValidator } = require("../middlewares/validators/debt/itemValidator");
const { paymentCreateValidator, paymentUpdateValidator } = require("../middlewares/validators/debt/paymentValidator");

const debtRouter = require("express").Router();

debtRouter
  .use(checkTokenMiddleware)
  .use(checkPermissionMiddleware(Permissions.debt_crud))

  // ==================== DEBT ====================
  .post("/", debtCreateValidatorMiddleware, debtController.createOne)
  .get("/", debtController.getAll)
  .get("/excel-doc", debtController.getDebtsExcel)
  .get("/trash", debtController.getDeleted)
  .patch("/trash/:id", debtController.restoreOne)
  .delete("/trash/:id", debtController.absoluteDeleteOne)
  .get("/:id", debtController.getOne)
  .get("/:id/items-excel", debtController.getDebtItemsExcel)
  .get("/:id/history-excel", debtController.getDebtHistoryExcel)
  .put("/:id", debtUpdateValidatorMidlleware, debtController.updateOne)
  .delete("/:id", debtController.deleteOne)

  // ==================== INDIVIDUAL: TRANSACTIONS ====================
  .post("/:id/transactions", transactionCreateValidator, debtController.addTransaction)
  .put("/:id/transactions/:transactionId", transactionUpdateValidator, debtController.updateTransaction)
  .delete("/:id/transactions/:transactionId", debtController.deleteTransaction)

  // ==================== COMPANY: ITEMS ====================
  .post("/:id/items", itemCreateValidator, debtController.addItem)
  .put("/:id/items/:itemId", itemUpdateValidator, debtController.updateItem)
  .delete("/:id/items/:itemId", debtController.deleteItem)

  // ==================== COMPANY: PAYMENTS ====================
  .post("/:id/payments", paymentCreateValidator, debtController.addPayment)
  .put("/:id/payments/:paymentId", paymentUpdateValidator, debtController.updatePayment)
  .delete("/:id/payments/:paymentId", debtController.deletePayment)

  // ==================== AUDIT LOGS ====================
  .get("/:id/audit-logs", debtController.getAuditLogs);

module.exports = { debtRouter };

// ## API Cheat Sheet
// ┌─────────────────────────────────────────────────────────────────────────┐
// │                              API ENDPOINTS                              │
// ├─────────────────────────────────────────────────────────────────────────┤
// │                                                                         │
// │  DEBT (Umumiy)                                                          │
// │  ─────────────                                                          │
// │  POST   /debts              → Yangi qarz yaratish                       │
// │  GET    /debts              → Ro'yxat                                   │
// │  GET    /debts/:id          → Bitta qarz (tarix bilan)                  │
// │  PUT    /debts/:id          → Tahrirlash                                │
// │  DELETE /debts/:id          → O'chirish                                 │
// │                                                                         │
// │  JISMONIY UCHUN                                                         │
// │  ──────────────                                                         │
// │  POST   /debts/:id/transactions           → Qarz/To'lov qo'shish        │
// │  PUT    /debts/:id/transactions/:tid      → Tahrirlash                  │
// │  DELETE /debts/:id/transactions/:tid      → O'chirish                   │
// │                                                                         │
// │  YURIDIK UCHUN                                                          │
// │  ─────────────                                                          │
// │  POST   /debts/:id/items                  → Mahsulot qo'shish           │
// │  PUT    /debts/:id/items/:itemId          → Mahsulot tahrirlash         │
// │  DELETE /debts/:id/items/:itemId          → Mahsulot o'chirish          │
// │                                                                         │
// │  POST   /debts/:id/payments               → To'lov qo'shish             │
// │  PUT    /debts/:id/payments/:paymentId    → To'lov tahrirlash           │
// │  DELETE /debts/:id/payments/:paymentId    → To'lov o'chirish            │
// │                                                                         │
// │  AUDIT                                                                  │
// │  ─────                                                                  │
// │  GET    /debts/:id/audit-logs             → O'zgarishlar tarixi         │
// │                                                                         │
// │  EXCELS                                                                 │
// │  ──────                                                                 │
// │  GET    /debts/get-excel                → Qarzdorlarni ro'yxati         │
// │  GET    /debts/:id/items-excel          → Maxsulotlar ro'yxati          │
// │  GET    /debts/:id/history-excel        → Qarz tarixi                   │
// │                                                                         │
// └─────────────────────────────────────────────────────────────────────────┘
