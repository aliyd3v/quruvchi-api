const warehouseController = require("../controllers/warehouse.controller");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { warehouseCreateValidatorMiddleware } = require("../middlewares/validators/warehouse/warehouseCreateValidatorMiddleware");
const { warehouseUpdateValidatorMiddleware } = require("../middlewares/validators/warehouse/warhouseUpdateValidatorMiddleware");

const warehouseRouter = require("express").Router();

warehouseRouter
  .use(checkRoleMiddleware)
  .post("/", checkRoleMiddleware(Role.SUPERADMIN), warehouseCreateValidatorMiddleware, warehouseController.createOne)
  .get("/", warehouseController.getAll)
  .get("/:id", warehouseController.getOne)
  .put("/:id", checkRoleMiddleware(Role.SUPERADMIN), warehouseUpdateValidatorMiddleware, warehouseController.updateOne)
  .delete("/:id", checkRoleMiddleware(Role.SUPERADMIN), warehouseController.deleteOne);

module.exports = { warehouseRouter };
