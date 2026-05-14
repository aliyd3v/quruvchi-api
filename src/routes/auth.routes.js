const authController = require("../controllers/auth.controller");
const { completeResetPasswordValidatorMiddleware } = require("../middlewares/validators/resetPassword/completeResetPasswordValidatorMiddleware");
const { loginValidatorMiddleware } = require("../middlewares/validators/login/loginValidatorMiddleware");
const { requestResetPassValidatorMiddleware } = require("../middlewares/validators/resetPassword/requestResetPassValidatorMiddleware");
const { resetPassResendCodeValidatorMiddleware } = require("../middlewares/validators/resetPassword/resetPassResendCodeValidatorMiddleware");
const { verifyLoginCodeValidatorMiddleware } = require("../middlewares/validators/login/verifyLoginCodeValidatorMiddleware");
const { verifyResetPassCodeValidatorMiddleware } = require("../middlewares/validators/resetPassword/verifyResetPassCodeValidatorMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");
const { verify2FASetupVerifyValidatorMiddleware } = require("../middlewares/validators/twoFA/verify2FASetupVerifyValidatorMiddleware");

const authRouter = require("express").Router();

authRouter
  .post("/login", loginValidatorMiddleware, authController.login)
  .post("/2fa/login", verifyLoginCodeValidatorMiddleware, authController.login2FAVerify)
  .get("/google", authController.googleRedirect)
  .get("/callback", authController.googleCallBack)
  .post("/2fa/setup", checkTokenMiddleware, authController.setup2FA)
  .post("/2fa/verify-setup", checkTokenMiddleware, verify2FASetupVerifyValidatorMiddleware, authController.verifySetup2FA)
  .post("/2fa/disable", checkTokenMiddleware, authController.disable2FA)
  .post("/request-reset-password", requestResetPassValidatorMiddleware, authController.requestResetPassword)
  .post("/reset-password-resend-otp", resetPassResendCodeValidatorMiddleware, authController.resetPasswordResendCode)
  .post("/verify-reset-otp", verifyResetPassCodeValidatorMiddleware, authController.verifyResetPasswordCode)
  .post("/complete-reset-password", completeResetPasswordValidatorMiddleware, authController.completeResetPassword);

module.exports = { authRouter };
