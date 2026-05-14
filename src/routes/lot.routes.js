const lotController = require("../controllers/lot.controller");
const upload = require("../utils/multer");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { lotCreateValidationMiddleware } = require("../middlewares/validators/lot/lotCreateValidationMiddleware");
const { searchValidatorMiddleware } = require("../middlewares/validators/lot/searchValidatorMiddleware");
const { uploadMultipleFiles } = require("../middlewares/uploadToStorageMiddleware");
const { lotTaskCreateValidatorMiddleware } = require("../middlewares/validators/lot/lotTaskCreateValidatorMiddleware");
const { lotUpdateValidatorMiddleware } = require("../middlewares/validators/lot/lotUpdateValidatorMiddleware");
const { lotTaskCompleteValidatorMiddleware } = require("../middlewares/validators/lot/lotTaskCompleteValidatorMiddleware");
const { lotTaskUpdateValidatorMiddleware } = require("../middlewares/validators/lot/lotTaskUpdateValidatorMiddleware");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const Permissions = require("../constants/PermissionEnum");

const lotRouter = require("express").Router();

lotRouter
  .use(checkTokenMiddleware)
  .use(checkPermissionMiddleware(Permissions.lot_crud))
  .post(
    "/",
    checkRoleMiddleware(Role.SUPERADMIN, Role.ACCOUNTANT),
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
    checkRoleMiddleware(Role.SUPERADMIN, Role.PTO, Role.ACCOUNTANT),
    upload.array("files"),
    lotTaskCreateValidatorMiddleware,
    lotController.createLotTask,
    uploadMultipleFiles,
    lotController.uploadLotTaskAttachment,
  )
  .patch("/task/:id", checkRoleMiddleware(Role.SUPERADMIN, Role.PTO, Role.ACCOUNTANT), lotController.changeLotTaskStatusToInProgress)
  .post("/task/:id", upload.array("files"), lotTaskCompleteValidatorMiddleware, lotController.writeLotTaskCompleted, uploadMultipleFiles, lotController.uploadLotTaskCompletedAttachment)
  .put("/task/:id", checkRoleMiddleware(Role.SUPERADMIN), lotTaskUpdateValidatorMiddleware, lotController.updateOneLotTask)
  .patch("/task/:id/check", checkRoleMiddleware(Role.SUPERADMIN), lotController.checkLotTask)
  .put("/:id", checkRoleMiddleware(Role.SUPERADMIN, Role.ACCOUNTANT), lotUpdateValidatorMiddleware, lotController.updateOne)
  .delete("/:id", checkRoleMiddleware(Role.SUPERADMIN), lotController.deleteOne);

module.exports = { lotRouter };
