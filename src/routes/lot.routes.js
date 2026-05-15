const lotController = require("../controllers/lot.controller");
const upload = require("../utils/multer");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { lotCreateValidationMiddleware } = require("../middlewares/validators/lot/lotCreateValidationMiddleware");
const { searchValidatorMiddleware } = require("../middlewares/validators/lot/searchValidatorMiddleware");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { lotTaskCreateValidatorMiddleware } = require("../middlewares/validators/lot/lotTaskCreateValidatorMiddleware");
const { lotUpdateValidatorMiddleware } = require("../middlewares/validators/lot/lotUpdateValidatorMiddleware");
const { lotTaskCompleteValidatorMiddleware } = require("../middlewares/validators/lot/lotTaskCompleteValidatorMiddleware");
const { lotTaskUpdateValidatorMiddleware } = require("../middlewares/validators/lot/lotTaskUpdateValidatorMiddleware");
const { checkPermission } = require("../middlewares/checkPermission");
const Permissions = require("../constants/permission");

const lotRouter = require("express").Router();

lotRouter
  .use(checkToken)
  .use(checkPermission(Permissions.lot_crud))
  .post(
    "/",
    checkRole(Role.SUPERADMIN, Role.ACCOUNTANT),
    upload.array("files"),
    lotCreateValidationMiddleware,
    lotController.createOne,
    uploadMultipleFiles,
    lotController.uploadLotAttachment,
  )
  .get("/", lotController.getAll)
  .get("/get-excel-doc", lotController.getExcelDoc)
  .post("/search", searchValidatorMiddleware, lotController.searchFromTenderMcUz)
  .get("/trash", lotController.getDeleted)
  .patch("/trash/:id", lotController.restoreOne)
  .delete("/trash/:id", lotController.absoluteDelete)
  .get("/:id", lotController.getOne)
  .post(
    "/:id",
    checkRole(Role.SUPERADMIN, Role.PTO, Role.ACCOUNTANT),
    upload.array("files"),
    lotTaskCreateValidatorMiddleware,
    lotController.createLotTask,
    uploadMultipleFiles,
    lotController.uploadLotTaskAttachment,
  )
  .patch("/task/:id", checkRole(Role.SUPERADMIN, Role.PTO, Role.ACCOUNTANT), lotController.changeLotTaskStatusToInProgress)
  .post("/task/:id", upload.array("files"), lotTaskCompleteValidatorMiddleware, lotController.writeLotTaskCompleted, uploadMultipleFiles, lotController.uploadLotTaskCompletedAttachment)
  .put("/task/:id", checkRole(Role.SUPERADMIN), lotTaskUpdateValidatorMiddleware, lotController.updateOneLotTask)
  .patch("/task/:id/check", checkRole(Role.SUPERADMIN), lotController.checkLotTask)
  .put("/:id", checkRole(Role.SUPERADMIN, Role.ACCOUNTANT), lotUpdateValidatorMiddleware, lotController.updateOne)
  .delete("/:id", checkRole(Role.SUPERADMIN), lotController.deleteOne);

module.exports = { lotRouter };
