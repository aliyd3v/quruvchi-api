const entryController = require("../controllers/entry.controller");
const Permissions = require("../enums/PermissionEnum");
const { Role } = require("../generated/prisma");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { uploadMultipleFields } = require("../middlewares/uploadToStorageMiddleware");
const { closeTheInvoiceValidatorMiddleware } = require("../middlewares/validators/entry/closeTheInvoiceValidatorMiddleware");
const { entryCreateValidatorMiddleware } = require("../middlewares/validators/entry/entryCreateValidatorMiddleware");
const { entryUpdateValidatorMiddleware } = require("../middlewares/validators/entry/entryUpdateValidationMiddleware");
const upload = require("../utils/multer");

const entryRouter = require("express").Router();

entryRouter
  .use(checkTokenMiddleware)
  .use(checkPermissionMiddleware(Permissions.ie_crud))
  .post(
    "/",
    upload.fields([
      { name: "invoiceFiles", maxCount: 5 },
      { name: "bankAcceptanceFiles", maxCount: 5 },
    ]),
    entryCreateValidatorMiddleware,
    entryController.createOne,
    uploadMultipleFields,
    entryController.uploadInvoiceAttachments
  )
  .get("/", entryController.getAll)
  .get("/trash", entryController.getDeleted)
  .patch("/trash/:id", entryController.restoreOne)
  .delete("/trash/:id", entryController.absoluteDelete)
  .get("/:id", entryController.getOne)
  .get('/:id/call', entryController.manuallyCall)
  .put("/:id", entryUpdateValidatorMiddleware, entryController.updateOne)
  .patch(
    "/:id",
    upload.fields([
      { name: "invoiceFiles", maxCount: 5 },
      { name: "bankAcceptanceFiles", maxCount: 5 },
    ]),
    closeTheInvoiceValidatorMiddleware,
    entryController.closeTheInvoice,
    uploadMultipleFields,
    entryController.uploadInvoiceAttachments
  )
  .delete("/:id", entryController.deleteOne);

module.exports = { entryRouter };
