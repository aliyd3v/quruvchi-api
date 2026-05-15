const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { checkPermission } = require("../middlewares/checkPermission");
const salaryController = require("../controllers/salary.controller");
const { salaryMonthCreateValidatorMiddleware } = require("../middlewares/validators/salary/salaryMonthCreateValidatorMiddleware");
const { salaryPaymentCreateValidatorMiddleware } = require("../middlewares/validators/salary/salaryPaymentCreateValidatorMiddleware");
const { salaryMonthUpdateValidatorMiddleware } = require("../middlewares/validators/salary/salaryMonthUpdateValidatorMiddleware");

const salaryRouter = require("express").Router();

salaryRouter
  .use(checkToken)
  .post("/create-salary-month", checkPermission("salary_crud"), salaryMonthCreateValidatorMiddleware, salaryController.createSalaryMonth)
  .get("/salary-months", checkPermission("salary_crud"), salaryController.getAllSalaryMonths)
  .get("/salary-months/:id", checkPermission("salary_crud"), salaryController.getUserSalaryMonths)
  .get("/salary-months/:id/get-excel-doc", checkPermission("salary_crud"), salaryController.getUserSalaryMonthsExcelDoc)
  .post("/create-salary-payment", checkPermission("salary_crud"), salaryPaymentCreateValidatorMiddleware, salaryController.createOneSalaryPayment)
  .delete("/salary-payment/:id", checkPermission("salary_crud"), salaryController.deleteOneSalaryPayment)
  .get("/users", checkPermission("salary_crud"), salaryController.getUsers)
  .get("/workers", checkPermission("salary_crud"), salaryController.getWorkers)
  .delete("/salary-month/:id", checkPermission("salary_crud"), salaryController.deleteOneSalaryMonth)
  .put("/salary-month/:id", checkPermission("salary_crud"), salaryMonthUpdateValidatorMiddleware, salaryController.updateOneSalaryMonth)
  .get("/salary-month/:id", checkPermission("salary_crud"), salaryController.getOneSalaryMonth)
  .get("/search-user", checkPermission("salary_crud"), salaryController.searchUser)
  .get("/get-users-excel-doc", checkPermission("salary_crud"), salaryController.getExcelDoc)
  .get("/self-salary-months", salaryController.selfSalaryMonths)
  .get("/self-salary-months/get-excel-doc", salaryController.selfSalaryMonthsExcelDoc)
  .get("/self-salary-months/:id", salaryController.selfSalaryMonth);

module.exports = { salaryRouter };
