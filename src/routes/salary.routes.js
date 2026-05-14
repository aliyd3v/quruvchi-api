const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const salaryController = require("../controllers/salary.controller");
const { salaryMonthCreateValidatorMiddleware } = require("../middlewares/validators/salary/salaryMonthCreateValidatorMiddleware");
const { salaryPaymentCreateValidatorMiddleware } = require("../middlewares/validators/salary/salaryPaymentCreateValidatorMiddleware");
const { salaryMonthUpdateValidatorMiddleware } = require("../middlewares/validators/salary/salaryMonthUpdateValidatorMiddleware");

const salaryRouter = require("express").Router();

salaryRouter
  .use(checkTokenMiddleware)
  .post("/create-salary-month", checkPermissionMiddleware("salary_crud"), salaryMonthCreateValidatorMiddleware, salaryController.createSalaryMonth)
  .get("/salary-months", checkPermissionMiddleware("salary_crud"), salaryController.getAllSalaryMonths)
  .get("/salary-months/:id", checkPermissionMiddleware("salary_crud"), salaryController.getUserSalaryMonths)
  .get("/salary-months/:id/get-excel-doc", checkPermissionMiddleware("salary_crud"), salaryController.getUserSalaryMonthsExcelDoc)
  .post("/create-salary-payment", checkPermissionMiddleware("salary_crud"), salaryPaymentCreateValidatorMiddleware, salaryController.createOneSalaryPayment)
  .delete("/salary-payment/:id", checkPermissionMiddleware("salary_crud"), salaryController.deleteOneSalaryPayment)
  .get("/users", checkPermissionMiddleware("salary_crud"), salaryController.getUsers)
  .get("/workers", checkPermissionMiddleware("salary_crud"), salaryController.getWorkers)
  .delete("/salary-month/:id", checkPermissionMiddleware("salary_crud"), salaryController.deleteOneSalaryMonth)
  .put("/salary-month/:id", checkPermissionMiddleware("salary_crud"), salaryMonthUpdateValidatorMiddleware, salaryController.updateOneSalaryMonth)
  .get("/salary-month/:id", checkPermissionMiddleware("salary_crud"), salaryController.getOneSalaryMonth)
  .get("/search-user", checkPermissionMiddleware("salary_crud"), salaryController.searchUser)
  .get("/get-users-excel-doc", checkPermissionMiddleware("salary_crud"), salaryController.getExcelDoc)
  .get("/self-salary-months", salaryController.selfSalaryMonths)
  .get("/self-salary-months/get-excel-doc", salaryController.selfSalaryMonthsExcelDoc)
  .get("/self-salary-months/:id", salaryController.selfSalaryMonth);

module.exports = { salaryRouter };
