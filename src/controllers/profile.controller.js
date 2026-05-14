const jwt = require("jsonwebtoken");
const Config = require("../config");
const translations = require("../constants");
const prisma = require("../lib/prisma");
const AppError = require("../utils/AppError");
const { comparePassword, hashPassword } = require("../utils/bcrypt");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(Config.GOOGLE_CLIENT_ID);

const profileController = {
  getProfile(req, res, _next) {
    req.user.emailHasGmail = req.user.email && typeof req.user.email === "string" && req.user.email.endsWith("gmail.com");

    res.status(200).json({
      status: "success",
      data: req.user,
    });
  },

  async updateProfile(req, res, next) {
    try {
      const { email } = req.body;

      const emailCondidat = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isActive: true },
      });

      if (emailCondidat && emailCondidat?.id !== req.user.id) {
        if (!emailCondidat.isActive) throw new AppError(400, "already_exists_user_with_this_email_and_that_not_active");
        throw new AppError(400, "email_already_taken");
      }

      await prisma.user.update({
        where: { id: req.user.id },
        data: req.body,
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async updateProfilePhone(req, res, next) {
    try {
      const {
        body: { phone },
        user: { id },
      } = req;

      const phoneCondidat = await prisma.user.findUnique({
        where: { phone },
        select: { id: true, isActive: true },
      });

      if (phoneCondidat && phoneCondidat?.id !== id) {
        if (phoneCondidat.isActive === false) throw new AppError(400, "already_exists_user_with_this_phone_and_that_not_active");
        throw new AppError(400, "phone_already_taken");
      }

      await prisma.user.update({
        where: { id },
        data: { phone },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async udpatePassword(req, res, next) {
    try {
      const {
        body: { password, new_password },
        user: { id },
      } = req;

      const user = await prisma.user.findUnique({
        where: { id },
        select: { password: true },
      });

      const isTruePassword = await comparePassword(password, user.password);
      if (!isTruePassword) {
        throw new AppError(400, "old_password_wrong", {
          path: "password",
          message: translations["wrong_password"],
        });
      }

      const passwordHash = await hashPassword(new_password);

      await prisma.user.update({
        where: { id },
        data: {
          password: passwordHash,
          pwdVersion: { increment: 1 },
        },
      });

      res.status(200).json({
        status: "success",
      });
    } catch (error) {
      next(localErrorHandler(error));
    }
  },

  async connectGoogleRedirect(req, res, _next) {
    const { token } = req.query;
    if (!token) return res.send("<script>window.close()</script>");

    let decoded;
    try {
      decoded = jwt.verify(token, Config.JWT_SECRET_KEY);
    } catch (err) {
      return res.send("<script>window.close()</script>");
    }

    if (!decoded.sub) {
      return res.send("<script>window.close()</script>");
    }

    const user = await prisma.user.findFirst({
      where: { id: decoded.sub, isActive: true },
      select: {
        id: true,
        email: true,
        phone: true,
        blockedUntil: true,
      },
    });

    if (!user) return res.send("<script>window.close()</script>");

    if (user.blockedUntil !== null && new Date(user.blockedUntil).getTime() > Date.now()) {
      return res.send("<script>window.close()</script>");
    }

    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      scope: ["profile", "email"],
      state: token,
      redirect_uri: Config.GOOGLE_REDIRECT_URI_FOR_CONNECT,
    });

    res.redirect(authUrl);
  },

  async connectGoogleCallBack(req, res, _next) {
    try {
      const { code, state: token } = req.query;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: Config.GOOGLE_CLIENT_ID,
          client_secret: Config.GOOGLE_CLIENT_SECRET,
          redirect_uri: Config.GOOGLE_REDIRECT_URI_FOR_CONNECT,
          grant_type: "authorization_code",
        }),
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();

        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userRes.ok) {
          let decoded;
          try {
            decoded = jwt.verify(token, Config.JWT_SECRET_KEY);
          } catch (err) {
            return res.send("<script>window.close()</script>");
          }
          if (!decoded.sub) {
            return res.send("<script>window.close()</script>");
          }

          const user = await prisma.user.findFirst({
            where: { id: decoded.sub, isActive: true },
            select: {
              id: true,
              email: true,
              phone: true,
              blockedUntil: true,
            },
          });
          if (!user) return res.send("<script>window.close()</script>");
          if (user.blockedUntil !== null && new Date(user.blockedUntil).getTime() > Date.now()) {
            return res.send("<script>window.close()</script>");
          }
          const userData = await userRes.json();

          const condidatGmail = await prisma.user.findUnique({ where: { email: userData.email } });
          if (condidatGmail && condidatGmail.id !== user.id) {
            return res.send(`
                            <script>
                            window.opener.postMessage({ statusCode: 400, message: "already_exists" }, "${Config.ORIGIN}");
                            window.close();
                            </script>
                        `);
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { email: userData.email },
          });

          return res.send(`
                        <script>
                        window.opener.postMessage({ statusCode: 200 }, "${Config.ORIGIN}");
                        window.close();
                        </script>
                    `);
        }
      }

      res.send(`
                <script>
                window.opener.postMessage({ statusCode: 400, message: "try_again_later" }, "${Config.ORIGIN}");
                window.close();
                </script>
            `);
    } catch (error) {
      console.log(error);
      res.send(`
                <script>
                window.opener.postMessage({ statusCode: 400, message: "try_again_later" }, "${Config.ORIGIN}");
                window.close();
                </script>
            `);
    }
  },
};
module.exports = profileController;
