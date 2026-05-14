const organizationController = require("../controllers/organization.controller");
const Permissions = require("../enums/PermissionEnum");
const { Role } = require("../generated/prisma");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { organizationBranchCreateValidatorMiddleware } = require("../middlewares/validators/organization/organizationBranchCreateValidatorMiddleware");
const { organizationCreateValidatorMiddleware } = require("../middlewares/validators/organization/organizationCreateValidatorMiddleware");
const { organizationUpdateValidatorMiddleware } = require("../middlewares/validators/organization/organizationUpdateValidatorMiddleware");

const organizationRouter = require("express").Router();

organizationRouter
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.organization_crud), organizationCreateValidatorMiddleware, organizationController.createOne)
  .post("/branch", checkPermissionMiddleware(Permissions.organization_crud), organizationBranchCreateValidatorMiddleware, organizationController.createBranch)
  .get("/", checkPermissionMiddleware(Permissions.organization_crud), organizationController.getAll)
  .get("/get-excel-doc", checkRoleMiddleware(Role.SUPERADMIN, Role.ADMIN, Role.PTO, Role.ACCOUNTANT), organizationController.getExcelDoc)
  .get("/search", organizationController.search)
  .get("/get-names", organizationController.getOrgNames)
  .get("/get-all-without-balance", organizationController.getAllWithoutBalance)
  .get("/trash", checkRoleMiddleware(Role.SUPERADMIN), organizationController.getDeleted)
  .patch("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), organizationController.restoreOne)
  .delete("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), organizationController.deleteAbsolute)
  .get("/:id", organizationController.getOne)
  .get("/:id/transfers", checkPermissionMiddleware(Permissions.organization_crud), organizationController.getOneOrganizationTransfersWithPagination)
  .get("/:id/transactions", checkPermissionMiddleware(Permissions.organization_crud), organizationController.getOneOrganizationTransactionsWithPagination)
  .get("/:id/user-transactions", organizationController.getUserTransactionsFromOneOrganization)
  .put("/:id", checkPermissionMiddleware(Permissions.organization_crud), organizationUpdateValidatorMiddleware, organizationController.updateOne)
  .delete("/:id", checkPermissionMiddleware(Permissions.organization_crud), organizationController.deleteOne);

module.exports = { organizationRouter };
