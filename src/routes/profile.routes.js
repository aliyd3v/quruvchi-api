const profileController = require("../controllers/profile.controller");
const Permissions = require("../constants/permission");
const { Role } = require("../generated/prisma");
const { checkPermission } = require("../middlewares/checkPermission");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");
const { passwordUpdateValidatorMiddleware } = require("../middlewares/validators/profile/passwordUpdateValidator");
const { profilePhoneUpdateValidatorMiddleware } = require("../middlewares/validators/profile/profilePhoneUpdateValidatorMiddleware");
const { profileUpdateValidatorMiddleware } = require("../middlewares/validators/profile/profileUpdateValidatorMiddleware");

const profileRouter = require("express").Router();

profileRouter
  .get("/", checkToken, profileController.getProfile)
  .put("/change", checkToken, checkPermission(Permissions.update_profile), profileUpdateValidatorMiddleware, profileController.updateProfile)
  .patch("/change/phone", checkToken, checkRole(Role.SUPERADMIN), profilePhoneUpdateValidatorMiddleware, profileController.updateProfilePhone)
  .patch("/change/password", checkToken, checkPermission(Permissions.update_password), passwordUpdateValidatorMiddleware, profileController.udpatePassword)
  .get("/connect-google", profileController.connectGoogleRedirect)
  .get("/connect-google/callback", profileController.connectGoogleCallBack);

module.exports = { profileRouter };
