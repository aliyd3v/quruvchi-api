const warehouseController = require("../controllers/warehouse.controller");
const { Roles } = require("../enums/RoleEnum");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { warehouseCreateValidatorMiddleware } = require("../middlewares/validators/warehouse/warehouseCreateValidatorMiddleware");
const { warehouseUpdateValidatorMiddleware } = require("../middlewares/validators/warehouse/warhouseUpdateValidatorMiddleware");

const warehouseRouter = require("express").Router();

warehouseRouter
  .use(checkRoleMiddleware)
  .post("/", checkRoleMiddleware(Roles.SUPERADMIN), warehouseCreateValidatorMiddleware, warehouseController.createOne)
  .get("/", warehouseController.getAll)
  .get("/:id", warehouseController.getOne)
  .put("/:id", checkRoleMiddleware(Roles.SUPERADMIN), warehouseUpdateValidatorMiddleware, warehouseController.updateOne)
  .delete("/:id", checkRoleMiddleware(Roles.SUPERADMIN), warehouseController.deleteOne);

module.exports = { warehouseRouter };
