const answerToWorkVolumeController = require("../controllers/answerToWorkVolume.controller");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { answerToWorkVolumeCreateValidatorMiddleware } = require("../middlewares/validators/answerToWorkVolume/answerToWorkVolumeCreateValidatorMiddleware");

const answerToWorkVolumeRouter = require("express").Router();

answerToWorkVolumeRouter
  .use(checkTokenMiddleware)
  .use(checkRoleMiddleware(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.PTO))
  .post("/", answerToWorkVolumeCreateValidatorMiddleware, answerToWorkVolumeController.createOne)
  .get("/", answerToWorkVolumeController.getAll)
  .get("/:id", answerToWorkVolumeController.getOne)
  .put("/:id", answerToWorkVolumeController.updateOne)
  .delete("/:id", answerToWorkVolumeController.deleteOne);

module.exports = { answerToWorkVolumeRouter };
