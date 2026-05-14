const answerToWorkVolumeController = require("../controllers/answerToWorkVolume.controller");
const { Roles } = require("../enums/RoleEnum");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { answerToWorkVolumeCreateValidatorMiddleware } = require("../middlewares/validators/answerToWorkVolume/answerToWorkVolumeCreateValidatorMiddleware");

const answerToWorkVolumeRouter = require("express").Router();

answerToWorkVolumeRouter
  .use(checkTokenMiddleware)
  .use(checkRoleMiddleware(Roles.SUPERADMIN, Roles.ADMIN, Roles.ACCOUNTANT, Roles.PTO))
  .post("/", answerToWorkVolumeCreateValidatorMiddleware, answerToWorkVolumeController.createOne)
  .get("/", answerToWorkVolumeController.getAll)
  .get("/:id", answerToWorkVolumeController.getOne)
  .put("/:id", answerToWorkVolumeController.updateOne)
  .delete("/:id", answerToWorkVolumeController.deleteOne);

module.exports = { answerToWorkVolumeRouter };
