const branchController = require("../controllers/branch.controller");
const Permissions = require("../constants/PermissionEnum");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { branchCreateValidatorMiddleware } = require("../middlewares/validators/branch/branchCreateValidatorMiddleware");

const branchRouter = require("express").Router();

branchRouter
  .use(checkTokenMiddleware)
  .post("/", checkPermissionMiddleware(Permissions.ie_crud), branchCreateValidatorMiddleware, branchController.createOne)
  .get("/", checkPermissionMiddleware(Permissions.ie_crud), branchController.getAll)
  .get("/search", branchController.getBranchesName)
  .get("/trash", checkPermissionMiddleware(Permissions.ie_crud), branchController.getDeleted)
  .patch("/trash/:id", checkPermissionMiddleware(Permissions.ie_crud), branchController.restoreOne)
  .delete("/trash/:id", checkPermissionMiddleware(Permissions.ie_crud), branchController.absoluteDelete)
  .get("/get-excel-doc", checkPermissionMiddleware(Permissions.ie_crud), branchController.getExcelDoc)
  .get("/:id", checkPermissionMiddleware(Permissions.ie_crud), branchController.getOne)
  .get("/:id/get-excel-doc", checkPermissionMiddleware(Permissions.ie_crud), branchController.getOneBranchExcelDoc)
  .put("/:id", checkPermissionMiddleware(Permissions.ie_crud), branchCreateValidatorMiddleware, branchController.updateOne)
  .delete("/:id", checkPermissionMiddleware(Permissions.ie_crud), branchController.deleteOne);

module.exports = { branchRouter };
