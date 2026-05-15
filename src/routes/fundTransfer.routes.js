const fundTransferController = require("../controllers/fundTransfer.controller");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { createFundToFundValidatorMiddleware } = require("../middlewares/validators/fundTransfer/createFundToFundValidatorMiddleware");
const { createFundToObjectValidatorMiddleware } = require("../middlewares/validators/fundTransfer/createFundToObjectValidatorMiddleware");
const { createObjectToFundValidatorMiddleware } = require("../middlewares/validators/fundTransfer/createObjectToFundValidatorMiddleware");
const { createObjectToOrganizationValidatorMiddleware } = require("../middlewares/validators/fundTransfer/createObjectToOrganizationValidatorMiddleware");
const { createUserToOrganizationValidatorMiddleware } = require("../middlewares/validators/fundTransfer/createUserToOrganizationValidatorMiddleware");
const { giveFromObjectValidatorMiddleware } = require("../middlewares/validators/fundTransfer/giveFromObjectValidatorMiddleware");
const { updateTransferValidatorMiddleware } = require("../middlewares/validators/fundTransfer/updateTransferValidatorMiddleware");

const fundTransferRouter = require("express").Router();

fundTransferRouter
  .use(checkToken)
  .post("/user-to-user", createFundToFundValidatorMiddleware, fundTransferController.createUserToUser)
  .post("/user-to-object", createFundToObjectValidatorMiddleware, fundTransferController.createUserToObject)
  .post("/object-to-user", createObjectToFundValidatorMiddleware, fundTransferController.createObjectToUser)
  .post("/give-from-object", giveFromObjectValidatorMiddleware, fundTransferController.giveFromObject)
  .post("/object-to-organization", createObjectToOrganizationValidatorMiddleware, fundTransferController.createObjectToOrganization)
  .post("/user-to-organization", createUserToOrganizationValidatorMiddleware, fundTransferController.createUserToOrganization)
  .get("/trash", fundTransferController.getDeleted)
  .patch("/trash/:id", fundTransferController.restoreOne)
  .delete("/trash/:id", fundTransferController.absoluteDelete)
  .get("/user-transfers", fundTransferController.getUserTransfers)
  .put("/:id", checkRole(Role.SUPERADMIN), updateTransferValidatorMiddleware, fundTransferController.updateOneTransfer)
  .delete("/:id", fundTransferController.deleteOneTransfer);

module.exports = { fundTransferRouter };
