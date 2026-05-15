const warehouseController = require("../controllers/warehouse.controller");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { warehouseCreateValidatorMiddleware } = require("../middlewares/validators/warehouse/warehouseCreateValidatorMiddleware");
const { warehouseUpdateValidatorMiddleware } = require("../middlewares/validators/warehouse/warhouseUpdateValidatorMiddleware");

const warehouseRouter = require("express").Router();

warehouseRouter
  .use(checkRole)
  .post("/", checkRole(Role.SUPERADMIN), warehouseCreateValidatorMiddleware, warehouseController.createOne)
  .get("/", warehouseController.getAll)
  .get("/:id", warehouseController.getOne)
  .put("/:id", checkRole(Role.SUPERADMIN), warehouseUpdateValidatorMiddleware, warehouseController.updateOne)
  .delete("/:id", checkRole(Role.SUPERADMIN), warehouseController.deleteOne);

module.exports = { warehouseRouter };
