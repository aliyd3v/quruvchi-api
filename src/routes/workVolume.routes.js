const workVolumeController = require("../controllers/workVolume.controller");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { workVolumeCreateValidatorMiddleware } = require("../middlewares/validators/workvolume/workVolumeCreateValidatorMiddleware");
const { workVolumeUpdateValidatorMiddleware } = require("../middlewares/validators/workvolume/workVolumeUpdateValidatorMiddleware");

const workVolumeRouter = require("express").Router();

workVolumeRouter
  .use(checkToken)
  .post("/", checkRole(Role.SUPERADMIN, Role.PTO), workVolumeCreateValidatorMiddleware, workVolumeController.createOne)
  .get("/", checkRole(Role.SUPERADMIN, Role.PTO), workVolumeController.getAll)
  .get("/trash", checkRole(Role.SUPERADMIN), workVolumeController.getDeleted)
  .get("/trash/search", checkRole(Role.SUPERADMIN), workVolumeController.searchDeleted)
  .patch("/trash/:id", checkRole(Role.SUPERADMIN), workVolumeController.restoreOne)
  .delete("/trash/:id", checkRole(Role.SUPERADMIN), workVolumeController.absoluteDelete)
  .get("/:id", checkRole(Role.SUPERADMIN, Role.PTO), workVolumeController.getOne)
  .put("/:id", checkRole(Role.SUPERADMIN, Role.PTO), workVolumeUpdateValidatorMiddleware, workVolumeController.updateOne)
  .delete("/:id", checkRole(Role.SUPERADMIN, Role.PTO), workVolumeController.deleteOne);

module.exports = { workVolumeRouter };
