const organizationController = require("../controllers/organization.controller");
const Permissions = require("../constants/permission");
const { Role } = require("../generated/prisma");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { organizationBranchCreateValidatorMiddleware } = require("../middlewares/validators/organization/organizationBranchCreateValidatorMiddleware");
const { organizationCreateValidatorMiddleware } = require("../middlewares/validators/organization/organizationCreateValidatorMiddleware");
const { organizationUpdateValidatorMiddleware } = require("../middlewares/validators/organization/organizationUpdateValidatorMiddleware");

const organizationRouter = require("express").Router();

organizationRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.organization_crud), organizationCreateValidatorMiddleware, organizationController.createOne)
  .post("/branch", checkPermission(Permissions.organization_crud), organizationBranchCreateValidatorMiddleware, organizationController.createBranch)
  .get("/", checkPermission(Permissions.organization_crud), organizationController.getAll)
  .get("/get-excel-doc", checkRole(Role.SUPERADMIN, Role.ADMIN, Role.PTO, Role.ACCOUNTANT), organizationController.getExcelDoc)
  .get("/search", organizationController.search)
  .get("/get-names", organizationController.getOrgNames)
  .get("/get-all-without-balance", organizationController.getAllWithoutBalance)
  .get("/trash", checkRole(Role.SUPERADMIN), organizationController.getDeleted)
  .patch("/trash/:id", checkRole(Role.SUPERADMIN), organizationController.restoreOne)
  .delete("/trash/:id", checkRole(Role.SUPERADMIN), organizationController.deleteAbsolute)
  .get("/:id", organizationController.getOne)
  .get("/:id/transfers", checkPermission(Permissions.organization_crud), organizationController.getOneOrganizationTransfersWithPagination)
  .get("/:id/transactions", checkPermission(Permissions.organization_crud), organizationController.getOneOrganizationTransactionsWithPagination)
  .get("/:id/user-transactions", organizationController.getUserTransactionsFromOneOrganization)
  .put("/:id", checkPermission(Permissions.organization_crud), organizationUpdateValidatorMiddleware, organizationController.updateOne)
  .delete("/:id", checkPermission(Permissions.organization_crud), organizationController.deleteOne);

module.exports = { organizationRouter };
