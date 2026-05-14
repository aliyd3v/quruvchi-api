const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const { addMinutes } = require("date-fns");
const AppError = require("../utils/AppError");
const Config = require("../config");
const prisma = require("../services/prisma");
const SMS = require("../utils/sms");
const { comparePassword, hashPassword } = require("../utils/bcrypt");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { rateLimiter } = require("../utils/rateLimiter");
const { getClientInfo } = require("../utils/getClientInfo");
const { encrypt, decrypt } = require("../utils/crypto");
const { sha256 } = require("../utils/hasher");
const { sendLogToTg } = require("../utils/sendLogToTg");

// Rate limiter setup.
// const limitForWrongAttempts = rateLimiter(5, 600, 600)
const limitForWrongAttempts = rateLimiter(5, 10, 10); /* <-- Delete this after testing */

const authController = {
  async login(req, res, next) {
    try {
      // Get client device info.
      const userInfo = getClientInfo(req);

      // Check phone for exists.
      const user = await prisma.user.findFirst({
        where: { phone: req.body.phone, isActive: true },
      });
      if (!user) {
        // Use rate limiter for wrong phone or password attempts.
        try {
          await limitForWrongAttempts.consume(`${userInfo.userAgent}-${req.body.phone}`, 1);
        } catch (rejRes) {
          const fullSecs = Math.ceil(rejRes.msBeforeNext / 1000);
          const min = Math.floor(fullSecs / 60);
          const sec = fullSecs % 60;
          const retryLater = `${min}:${sec < 10 ? `0${sec}` : sec}`;
          throw new AppError(429, "too_many_request_please_try_again_later", { retry_later: retryLater });
        }
        throw new AppError(400, "wrong_phone_or_password");
      }

      // Check password.
      const isTruePassword = await comparePassword(req.body.password, user.password);
      if (!isTruePassword) {
        // Use rate limiter for wrong phone or password attempts.
        try {
          await limitForWrongAttempts.consume(`${userInfo.userAgent}-${req.body.phone}`, 1);
        } catch (rejRes) {
          const fullSecs = Math.ceil(rejRes.msBeforeNext / 1000);
          const min = Math.floor(fullSecs / 60);
          const sec = fullSecs % 60;
          const retryLater = `${min}:${sec < 10 ? `0${sec}` : sec}`;
          throw new AppError(429, "too_many_request_please_try_again_later", { retry_later: retryLater });
        }
        throw new AppError(400, "wrong_phone_or_password");
      }

      // Delete limiter for this device.
      try {
        await limitForWrongAttempts.delete(`${userInfo.userAgent}-${req.body.phone}`);
      } catch (rejRes) {
        console.log("Limiter not deleted");
      }

      // Check blocks by admins.
      const blockedUntil = user.blockedUntil;
      if (blockedUntil !== null && new Date().getTime() < new Date(blockedUntil).getTime()) {
        throw new AppError(423, "user_temporarily_blocked", { blocked_until: blockedUntil });
      }

      // Check 2FA exists.
      if (user.is2FAEnabled) {
        const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
        const newTempToken = await prisma.tempToken.create({
          data: {
            userId: user.id,
            expiresAt: new Date(expiresAt * 1000),
            type: "2FA",
          },
        });

        // Create temp token.
        const payload = {
          sub: user.id,
          tfa: true,
          jti: newTempToken.jti,
          iat: Math.floor(Date.now() / 1000),
          exp: expiresAt,
          aud: Config.AUDIENCE,
          iss: Config.ISSUER,
          ctx: {
            // ip: userInfo.ip,
            ua_hash: sha256(userInfo.userAgent),
          },
        };
        const temp_token = jwt.sign(payload, Config.JWT_SECRET_KEY_TEMP);

        return res.status(202).json({
          status: "success",
          require_2fa: true,
          temp_token,
        });
      }

      // Generate access token.
      const payload = {
        sub: user.id,
        ver: user.pwdVersion,
        tfa: false,
        auth_step: "pwd",
        // jti: newTempToken.jti,
        iat: Math.floor(Date.now() / 1000),
        // exp: expiresAt,
        aud: Config.AUDIENCE,
        iss: Config.ISSUER,
        ctx: {
          // ip: userInfo.ip,
          ua_hash: sha256(userInfo.userAgent),
        },
      };
      const access_token = jwt.sign(payload, Config.JWT_SECRET_KEY, {
        expiresIn: "7d",
      });

      res.status(200).json({
        status: "success",
        require_2fa: false,
        access_token,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async login2FAVerify(req, res, next) {
    try {
      // Get client device info.
      const userInfo = getClientInfo(req);

      const { temp_token, code } = req.body;

      let tempToken = null;
      let decoded = null;

      // Decode token.
      try {
        decoded = jwt.verify(temp_token, Config.JWT_SECRET_KEY_TEMP);

        // Check decoded data.
        if (typeof decoded !== "object") throw new AppError(401, "unauthorized", "invalid_token");
        if (decoded.tfa !== true) throw new AppError(401, "unauthorized", "invalid_token");

        // Get authAttemp form database.
        tempToken = await prisma.tempToken.findUnique({
          where: { jti: decoded.jti },
        });
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) throw new AppError(401, "unauthorized", "token_expired");
        if (error instanceof jwt.JsonWebTokenError) throw new AppError(401, "unauthorized", "invalid_token");
        throw new AppError(401, "unauthorized", "jwt_error");
      }

      // Check temp token for exists.
      if (!tempToken) throw new AppError(401, "unauthorized");

      // Check token time.
      if (tempToken.expiresAt < Math.floor(Date.now() / 1000)) {
        throw new AppError(401, "unauthorized", "token_expired");
      }

      // Get temp token user.
      const user = await prisma.user.findFirst({
        where: { id: tempToken.userId, isActive: true },
        select: {
          id: true,
          is2FAEnabled: true,
          blockedUntil: true,
          email: true,
          phone: true,
          twoFASecret: true,
          pwdVersion: true,
        },
      });

      // Check 2FA code.
      const secret = decrypt(user.twoFASecret);
      const ok = speakeasy.totp.verify({ secret, encoding: "base32", token: code, window: 1 });
      if (!ok) throw new AppError(400, "invalid_2fa_code");

      // Generate access token.
      const payload = {
        sub: decoded.sub,
        ver: user.pwdVersion,
        tfa: false,
        // jti: newTempToken.jti,
        iat: Math.floor(Date.now() / 1000),
        // exp: expiresAt,
        aud: Config.AUDIENCE,
        iss: Config.ISSUER,
        ctx: {
          // ip: userInfo.ip,
          ua_hash: sha256(userInfo.userAgent),
        },
      };
      const access_token = jwt.sign(payload, Config.JWT_SECRET_KEY, {
        expiresIn: "7d",
      });

      res.status(200).json({
        status: "success",
        access_token,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  googleRedirect(_req, res, _next) {
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?client_id=${Config.GOOGLE_CLIENT_ID}&redirect_uri=${Config.GOOGLE_REDIRECT_URI}&response_type=code&scope=email%20profile`);
  },

  async googleCallBack(req, res, _next) {
    try {
      // Get client device info.
      const userInfo = getClientInfo(req);

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: req.query.code,
          client_id: Config.GOOGLE_CLIENT_ID,
          client_secret: Config.GOOGLE_CLIENT_SECRET,
          redirect_uri: Config.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      let user;

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();

        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
        if (userRes.ok) {
          const userData = await userRes.json();
          user = await prisma.user.findFirst({
            where: { email: userData.email, isActive: true },
            select: {
              id: true,
              phone: true,
              email: true,
              isActive: true,
              role: true,
              pwdVersion: true,
              blockedUntil: true,
              is2FAEnabled: true,
            },
          });

          if (user) {
            const blockedUntil = user.blockedUntil;
            if (blockedUntil && new Date().getTime() < new Date(blockedUntil).getTime()) {
              return res.send(`
                  <script>
                  window.opener.postMessage({ statusCode: 423, blocked_until: "${blockedUntil}", require_2fa: false, access_token: null }, "${Config.ORIGIN}");
                  window.close();
                  </script>
              `);
            }

            // Check 2FA exists.
            if (user.is2FAEnabled) {
              const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
              const newTempToken = await prisma.tempToken.create({
                data: { userId: user.id, expiresAt: new Date(expiresAt * 1000), type: "2FA" },
              });

              // Create temp token.
              const payload = {
                sub: user.id,
                tfa: true,
                jti: newTempToken.jti,
                iat: Math.floor(Date.now() / 1000),
                exp: expiresAt,
                aud: Config.AUDIENCE,
                iss: Config.ISSUER,
                ctx: {
                  // ip: userInfo.ip,
                  ua_hash: sha256(userInfo.userAgent),
                },
              };
              const temp_token = jwt.sign(payload, Config.JWT_SECRET_KEY_TEMP);

              return res.send(`
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ statusCode: 202, require_2fa: true, temp_token: "${temp_token}" }, "${Config.ORIGIN}");
                    }
                    window.close();
                  </script>
              `);
            }

            // Generate access token.
            const payload = {
              sub: user.id,
              ver: user.pwdVersion,
              tfa: false,
              auth_step: "google",
              // jti: newTempToken.jti,
              iat: Math.floor(Date.now() / 1000),
              // exp: expiresAt,
              aud: Config.AUDIENCE,
              iss: Config.ISSUER,
              ctx: {
                // ip: userInfo.ip,
                ua_hash: sha256(userInfo.userAgent),
              },
            };
            const access_token = jwt.sign(payload, Config.JWT_SECRET_KEY, {
              expiresIn: "7d",
            });

            return res.send(`
                <script>
                  if (window.opener) {
                    window.opener.postMessage({ statusCode: 200, require_2fa: false, access_token: "${access_token}" }, "${Config.ORIGIN}");
                  }
                  window.close();
                </script>
            `);
          }
        }
      }
      res.send(`
          <script>
            if (window.opener) {
              window.opener.postMessage({ access_token: null, statusCode: 401 }, "${Config.ORIGIN}");
            }
            window.close();
          </script>
      `);
    } catch (error) {
      console.log(error);
      res.send(`
          <script>
            if (window.opener) {
              window.opener.postMessage({ access_token: null, statusCode: 401 }, "${Config.ORIGIN}");
            }
            window.close();
          </script>
      `);
    }
  },

  async setup2FA(req, res, next) {
    try {
      if (req.user.is2FAEnabled) throw new AppError(400, "tfa_is_already_enabled_please_first_disable");

      // Generate and save secret (speakesy).
      const secret = speakeasy.generateSecret({
        length: 20,
        name: `MyApp (${req.user.phone})`,
      });
      const enc = encrypt(secret.base32);

      await prisma.user.update({
        where: { id: req.user.id },
        data: { twoFASecret: enc },
      });

      // Generate qr-code.
      const qrCode = await qrcode.toDataURL(secret.otpauth_url);

      res.status(200).json({
        status: "success",
        data: qrCode,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async verifySetup2FA(req, res, next) {
    try {
      const { code } = req.body;

      const user = await prisma.user.findFirst({
        where: { id: req.user.id, isActive: true },
        select: { id: true, twoFASecret: true, is2FAEnabled: true },
      });
      if (!user.twoFASecret) throw new AppError(400, "bad_request");

      const secret = decrypt(user.twoFASecret);
      const ok = speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token: code,
        window: 2,
      });
      if (!ok) throw new AppError(400, "code_is_wrong");

      await prisma.user.update({
        where: { id: req.user.id },
        data: { is2FAEnabled: true },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async disable2FA(req, res, next) {
    try {
      if (!req.user.is2FAEnabled) throw new AppError(400, "tfa_already_disabled");

      await prisma.user.update({
        where: { id: req.user.id },
        data: { is2FAEnabled: false, twoFASecret: null },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async requestResetPassword(req, res, next) {
    try {
      const userInfo = getClientInfo(req);

      const user = await prisma.user.findUnique({
        where: { phone: req.body.phone },
      });
      if (!user) throw new AppError(404, "user_not_found");

      // Check limits for sending SMS.
      const authAttempt = await prisma.resetAuthAttempts.findFirst({
        where: {
          userId: user.id,
          userAgent: userInfo.userAgent,
          type: "reset-password",
        },
        orderBy: { createdAt: "desc" },
      });

      // Check for limit times.
      if (authAttempt && !authAttempt.used) {
        // Check for blocks.
        if (authAttempt.blocked) throw new AppError(400, "device_blocked_contact_admin");

        const difference = new Date().getTime() - new Date(authAttempt.createdAt).getTime();

        // Check attempt period.
        if (authAttempt.period === 1 && difference < Config.LOGIN_OTP_TTL_PERIOD_1) {
          throw new AppError(400, "you_can_send_sms_after_4_min");
        }
        if (authAttempt.period === 2 && difference < Config.LOGIN_OTP_TTL_PERIOD_2) {
          throw new AppError(400, "you_can_send_sms_after_8_min");
        }
        if (authAttempt.period === 3 && difference < Config.LOGIN_OTP_TTL_PERIOD_3) {
          throw new AppError(400, "you_can_send_sms_after_30_min");
        }
        if (authAttempt.period === 4) {
          if (difference < Config.LOGIN_OTP_TTL_PERIOD_4) throw new AppError(400, "you_can_send_sms_after_6_hours");

          // // Block device.
          // await prisma.resetAuthAttempts.update({
          //   where: { attemptId: authAttempt.attemptId },
          //   data: { blocked: true },
          // });

          // throw new AppError(400, "your_device_has_been_blocked_please_contact_admin");
        }
      }

      // Generate OTP code.
      const code = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, "0");

      // Hash OTP code.
      const OTPHash = await hashPassword(code);

      // Generate expiresAt.
      const expires_at = addMinutes(new Date(), 5);

      // Create auth attempt.
      let authAttemptPeriod = 1;
      if (authAttempt) authAttemptPeriod = authAttempt.period === 4 ? 1 : authAttempt.period + 1;

      const newAuthAttempt = await prisma.resetAuthAttempts.create({
        data: {
          code: OTPHash,
          expiresAt: expires_at,
          ip: userInfo.ip,
          userAgent: userInfo.userAgent,
          userId: user.id,
          period: authAttemptPeriod,
          type: "reset-password",
        },
        select: { attemptId: true },
      });

      // Send SMS with code.
      await SMS.send(`998${req.body.phone}`, `Rsq.uz saytidagi parolingizni tiklash kodi ${code}`);

      res.status(200).json({
        status: "success",
        data: newAuthAttempt.attemptId,
        // code,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async resetPasswordResendCode(req, res, next) {
    try {
      // Get client device info.
      const userInfo = getClientInfo(req);

      const authAttempt = await prisma.resetAuthAttempts.findFirst({
        where: { attemptId: req.body.code_data, userAgent: userInfo.userAgent, type: "reset-password" },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              role: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!authAttempt) throw new AppError(400, "bad_request_please_retry_later");

      // Check for limit times.
      if (authAttempt && !authAttempt.used) {
        // Check for blocks.
        if (authAttempt.blocked) throw new AppError(400, "device_blocked_contact_admin");

        const difference = new Date().getTime() - new Date(authAttempt.createdAt).getTime();

        // Check attempt period.
        if (authAttempt.period === 1 && difference < Config.LOGIN_OTP_TTL_PERIOD_1) {
          throw new AppError(400, "you_can_send_sms_after_4_min");
        }
        if (authAttempt.period === 2 && difference < Config.LOGIN_OTP_TTL_PERIOD_2) {
          throw new AppError(400, "you_can_send_sms_after_8_min");
        }
        if (authAttempt.period === 3 && difference < Config.LOGIN_OTP_TTL_PERIOD_3) {
          throw new AppError(400, "you_can_send_sms_after_30_min");
        }
        if (authAttempt.period === 4) {
          if (difference < Config.LOGIN_OTP_TTL_PERIOD_4) throw new AppError(400, "you_can_send_sms_after_6_hours");

          // // Block device.
          // await prisma.resetAuthAttempts.update({
          //   where: { attemptId: authAttempt.attemptId },
          //   data: { blocked: true },
          // });

          // throw new AppError(400, "your_device_has_been_blocked_please_contact_admin");
        }
      }

      // Generate OTP code.
      const code = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, "0");

      // Hash OTP code.
      const OTPHash = await hashPassword(code);

      // Generate expiresAt.
      const expires_at = addMinutes(new Date(), 5);

      // Create auth attempt.
      let authAttemptPeriod = 1;
      if (authAttempt) authAttemptPeriod = authAttempt.period === 4 ? 1 : authAttempt.period + 1;

      // Create new authAttempt.
      const newAuthAttempt = await prisma.resetAuthAttempts.create({
        data: {
          code: OTPHash,
          expiresAt: expires_at,
          ip: userInfo.ip,
          userAgent: userInfo.userAgent,
          userId: authAttempt.user.id,
          period: authAttemptPeriod,
          type: "reset-password",
        },
        select: { attemptId: true },
      });

      // Send SMS with code.
      await SMS.send(`998${authAttempt.user.phone}`, `Rsq.uz saytidagi parolingizni tiklash kodi ${code}`);

      res.status(200).json({
        status: "success",
        data: newAuthAttempt.attemptId,
        // code,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async verifyResetPasswordCode(req, res, next) {
    try {
      // Get client device info.
      const userInfo = getClientInfo(req);

      // Get authAttemp from db.
      const authAttempt = await prisma.resetAuthAttempts.findFirst({
        where: { attemptId: req.body.code_data, type: "reset-password" },
        include: { user: { select: { id: true, role: true } } },
      });
      if (!authAttempt || authAttempt.used) throw new AppError(400, "code_is_wrong");
      if (authAttempt.attemptCount >= 5) throw new AppError(429, "too_many_wrong_request_please_get_code_again");

      if (authAttempt.userAgent !== userInfo.userAgent) {
        await prisma.resetAuthAttempts.update({
          where: { attemptId: req.body.code_data },
          data: { attemptCount: authAttempt.attemptCount + 1 },
        });
        throw new AppError(400, "code_is_wrong");
      }

      // Check OTP code.
      const isTrueOTP = await comparePassword(req.body.code, authAttempt.code);

      if (!isTrueOTP) {
        await prisma.resetAuthAttempts.update({
          where: { attemptId: req.body.code_data },
          data: { attemptCount: authAttempt.attemptCount + 1 },
        });
        throw new AppError(400, "code_is_wrong");
      }

      if (authAttempt.expiresAt.getTime() < new Date().getTime()) throw new AppError(400, "code_time_expired_please_get_new");

      await prisma.resetAuthAttempts.update({
        where: { attemptId: req.body.code_data },
        data: { used: true },
      });

      // Generate token.
      const payload = {
        tokenType: "reset-password",
        attemptId: req.body.code_data,
        ctx: { ua_hash: sha256(userInfo.userAgent) },
      };
      const token = jwt.sign(payload, Config.JWT_SECRET_KEY);

      res.status(200).json({
        status: "success",
        data: token,
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async completeResetPassword(req, res, next) {
    try {
      // Get client device info.
      const userInfo = getClientInfo(req);

      // Get token from header.
      const authorization = req.headers.authorization;
      if (!authorization || typeof authorization !== "string") throw new AppError(401, "unauthorized");

      const parts = authorization.split(" ");
      if (parts.length !== 2 || parts[0] !== "Bearer") throw new AppError(401, "unauthorized");

      const token = parts[1];

      let authAttempt = null;

      // Decode token.
      try {
        const decoded = jwt.verify(token, Config.JWT_SECRET_KEY);
        // Check decoded data.
        if (typeof decoded !== "object") throw new AppError(401, "unauthorized", "invalid_token");
        if (decoded.tokenType !== "reset-password" || !decoded.attemptId) throw new AppError(401, "unauthorized", "invalid_token");

        // Get authAttemp form database.
        authAttempt = await prisma.resetAuthAttempts.findFirst({
          where: { attemptId: decoded.attemptId, type: "reset-password" },
          include: {
            user: {
              select: {
                id: true,
                role: true,
                isActive: true,
                phone: true,
              },
            },
          },
        });
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) throw new AppError(401, "unauthorized", "token_expired");
        if (error instanceof jwt.JsonWebTokenError) throw new AppError(401, "unauthorized", "invalid_token");
        throw new AppError(401, "unauthorized", "jwt_error");
      }

      if (!authAttempt || authAttempt.userAgent !== userInfo.userAgent || !authAttempt.user?.isActive || !authAttempt.used || authAttempt.usedForReset) {
        throw new AppError(400, "bad_request_please_retry_later");
      }

      // Check time for expires_at in authAttempt.
      if (new Date(authAttempt.expiresAt).getTime() + 15 * 60 * 1000 < new Date().getTime()) {
        throw new AppError(410, "password_reset_time_expired_please_try_later");
      }

      // Update authAttempt.
      await prisma.resetAuthAttempts.update({
        where: { attemptId: authAttempt.attemptId },
        data: { usedForReset: true },
      });

      // Hash password.
      const passwordHash = await hashPassword(req.body.new_password);

      // Update user password from database.
      await prisma.user.update({
        where: { id: authAttempt.user.id },
        data: {
          password: passwordHash,
          pwdVersion: { increment: 1 },
        },
      });

      // Delete limits for this device.
      try {
        await limitForWrongAttempts.delete(`${userInfo.userAgent}-${authAttempt.user.phone}`);
      } catch (rejRes) {
        console.log("Limiter not deleted");
      }

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },
};

module.exports = authController;
