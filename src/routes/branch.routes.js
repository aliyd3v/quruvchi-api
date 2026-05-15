const branchController = require("../controllers/branch.controller");
const Permissions = require("../constants/permission");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkToken } = require("../middlewares/checkToken");
const { branchCreateValidatorMiddleware } = require("../middlewares/validators/branch/branchCreateValidatorMiddleware");

const branchRouter = require("express").Router();

branchRouter
  .use(checkToken)
  .post("/", checkPermission(Permissions.ie_crud), branchCreateValidatorMiddleware, branchController.createOne)
  .get("/", checkPermission(Permissions.ie_crud), branchController.getAll)
  .get("/search", branchController.getBranchesName)
  .get("/trash", checkPermission(Permissions.ie_crud), branchController.getDeleted)
  .patch("/trash/:id", checkPermission(Permissions.ie_crud), branchController.restoreOne)
  .delete("/trash/:id", checkPermission(Permissions.ie_crud), branchController.absoluteDelete)
  .get("/get-excel-doc", checkPermission(Permissions.ie_crud), branchController.getExcelDoc)
  .get("/:id", checkPermission(Permissions.ie_crud), branchController.getOne)
  .get("/:id/get-excel-doc", checkPermission(Permissions.ie_crud), branchController.getOneBranchExcelDoc)
  .put("/:id", checkPermission(Permissions.ie_crud), branchCreateValidatorMiddleware, branchController.updateOne)
  .delete("/:id", checkPermission(Permissions.ie_crud), branchController.deleteOne);

module.exports = { branchRouter };
