const workVolumeController = require("../controllers/workVolume.controller");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { workVolumeCreateValidatorMiddleware } = require("../middlewares/validators/workvolume/workVolumeCreateValidatorMiddleware");
const { workVolumeUpdateValidatorMiddleware } = require("../middlewares/validators/workvolume/workVolumeUpdateValidatorMiddleware");

const workVolumeRouter = require("express").Router();

workVolumeRouter
  .use(checkTokenMiddleware)
  .post("/", checkRoleMiddleware(Role.SUPERADMIN, Role.PTO), workVolumeCreateValidatorMiddleware, workVolumeController.createOne)
  .get("/", checkRoleMiddleware(Role.SUPERADMIN, Role.PTO), workVolumeController.getAll)
  .get("/trash", checkRoleMiddleware(Role.SUPERADMIN), workVolumeController.getDeleted)
  .get("/trash/search", checkRoleMiddleware(Role.SUPERADMIN), workVolumeController.searchDeleted)
  .patch("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), workVolumeController.restoreOne)
  .delete("/trash/:id", checkRoleMiddleware(Role.SUPERADMIN), workVolumeController.absoluteDelete)
  .get("/:id", checkRoleMiddleware(Role.SUPERADMIN, Role.PTO), workVolumeController.getOne)
  .put("/:id", checkRoleMiddleware(Role.SUPERADMIN, Role.PTO), workVolumeUpdateValidatorMiddleware, workVolumeController.updateOne)
  .delete("/:id", checkRoleMiddleware(Role.SUPERADMIN, Role.PTO), workVolumeController.deleteOne);

module.exports = { workVolumeRouter };
