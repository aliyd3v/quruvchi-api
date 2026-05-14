const workVolumeController = require("../controllers/workVolume.controller");
const { Roles } = require("../enums/RoleEnum");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { workVolumeCreateValidatorMiddleware } = require("../middlewares/validators/workvolume/workVolumeCreateValidatorMiddleware");
const { workVolumeUpdateValidatorMiddleware } = require("../middlewares/validators/workvolume/workVolumeUpdateValidatorMiddleware");

const workVolumeRouter = require("express").Router();

workVolumeRouter
  .use(checkTokenMiddleware)
  .post("/", checkRoleMiddleware(Roles.SUPERADMIN, Roles.PTO), workVolumeCreateValidatorMiddleware, workVolumeController.createOne)
  .get("/", checkRoleMiddleware(Roles.SUPERADMIN, Roles.PTO), workVolumeController.getAll)
  .get("/trash", checkRoleMiddleware(Roles.SUPERADMIN), workVolumeController.getDeleted)
  .get("/trash/search", checkRoleMiddleware(Roles.SUPERADMIN), workVolumeController.searchDeleted)
  .patch("/trash/:id", checkRoleMiddleware(Roles.SUPERADMIN), workVolumeController.restoreOne)
  .delete("/trash/:id", checkRoleMiddleware(Roles.SUPERADMIN), workVolumeController.absoluteDelete)
  .get("/:id", checkRoleMiddleware(Roles.SUPERADMIN, Roles.PTO), workVolumeController.getOne)
  .put("/:id", checkRoleMiddleware(Roles.SUPERADMIN, Roles.PTO), workVolumeUpdateValidatorMiddleware, workVolumeController.updateOne)
  .delete("/:id", checkRoleMiddleware(Roles.SUPERADMIN, Roles.PTO), workVolumeController.deleteOne);

module.exports = { workVolumeRouter };
