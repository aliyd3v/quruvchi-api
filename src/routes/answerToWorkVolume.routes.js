const answerToWorkVolumeController = require("../controllers/answerToWorkVolume.controller");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { answerToWorkVolumeCreateValidatorMiddleware } = require("../middlewares/validators/answerToWorkVolume/answerToWorkVolumeCreateValidatorMiddleware");

const answerToWorkVolumeRouter = require("express").Router();

answerToWorkVolumeRouter
  .use(checkToken)
  .use(checkRole(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.PTO))
  .post("/", answerToWorkVolumeCreateValidatorMiddleware, answerToWorkVolumeController.createOne)
  .get("/", answerToWorkVolumeController.getAll)
  .get("/:id", answerToWorkVolumeController.getOne)
  .put("/:id", answerToWorkVolumeController.updateOne)
  .delete("/:id", answerToWorkVolumeController.deleteOne);

module.exports = { answerToWorkVolumeRouter };
