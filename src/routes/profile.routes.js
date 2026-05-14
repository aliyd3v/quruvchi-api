const profileController = require("../controllers/profile.controller");
const Permissions = require("../constants/PermissionEnum");
const { Role } = require("../generated/prisma");
const { checkPermissionMiddleware } = require("../middlewares/checkPermissionMiddleware");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { passwordUpdateValidatorMiddleware } = require("../middlewares/validators/profile/passwordUpdateValidator");
const { profilePhoneUpdateValidatorMiddleware } = require("../middlewares/validators/profile/profilePhoneUpdateValidatorMiddleware");
const { profileUpdateValidatorMiddleware } = require("../middlewares/validators/profile/profileUpdateValidatorMiddleware");

const profileRouter = require("express").Router();

profileRouter
  .get("/", checkTokenMiddleware, profileController.getProfile)
  .put("/change", checkTokenMiddleware, checkPermissionMiddleware(Permissions.update_profile), profileUpdateValidatorMiddleware, profileController.updateProfile)
  .patch("/change/phone", checkTokenMiddleware, checkRoleMiddleware(Role.SUPERADMIN), profilePhoneUpdateValidatorMiddleware, profileController.updateProfilePhone)
  .patch("/change/password", checkTokenMiddleware, checkPermissionMiddleware(Permissions.update_password), passwordUpdateValidatorMiddleware, profileController.udpatePassword)
  .get("/connect-google", profileController.connectGoogleRedirect)
  .get("/connect-google/callback", profileController.connectGoogleCallBack);

module.exports = { profileRouter };
