const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
const Config = require("../config");
const prisma = require("../lib/prisma");
const { localErrorHandler } = require("../utils/localErrorHandler");
const { fromMinorUnits } = require("../utils/amount");

exports.checkTokenMiddleware = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization;

    if (!authorization || typeof authorization !== "string") {
      throw new AppError(401, "unauthorized");
    }

    const parts = authorization.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new AppError(401, "unauthorized");
    }
    const token = parts[1];

    let user = null;
    try {
      const decoded = jwt.verify(token, Config.JWT_SECRET_KEY);
      if (typeof decoded !== "object") {
        throw new AppError(401, "unauthorized", "invalid_token");
      }
      if (!decoded.sub) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }

      // Check user for existence.
      user = await prisma.user.findFirst({
        where: { id: decoded.sub, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          birthday: true,
          role: true,
          is2FAEnabled: true,
          blockedUntil: true,
          lastSeans: true,
          balance: true,
          totalExpense: true,
          totalIncome: true,
          permissions: true,
          createdAt: true,
          updatedAt: true,
          pwdVersion: true,
          avatar: {
            select: { url: true, filename: true },
          },
        },
      });
      if (!user) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }
      if (user.pwdVersion !== decoded.ver) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }

      // Check for blocks.
      const blockedUntil = user.blockedUntil;
      if (blockedUntil && Date.now() < blockedUntil.getTime()) {
        throw new AppError(423, "user_temporarily_blocked", { blocked_until: blockedUntil });
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(401, "unauthorized", "token_expired");
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }
      throw new AppError(401, "unauthorized", "jwt_error");
    }

    // Update last seans.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastSeans: new Date(),
        updatedAt: user.updatedAt,
      },
    });

    const { pwdVersion, ...cleanUserData } = user;
    req.user = {
      ...cleanUserData,
      balance: fromMinorUnits(user.balance),
      totalExpense: fromMinorUnits(user.totalExpense),
      totalIncome: fromMinorUnits(user.totalIncome),
    };
    next();
  } catch (error) {
    next(localErrorHandler(error));
  }
};

exports.checkQueryTokenMiddleware = async (req, _res, next) => {
  try {
    let { token } = req.query;
    token = typeof token === "string" ? token.trim() : null;
    if (!token) throw new AppError(401, "unauthorized");

    let user = null;
    try {
      const decoded = jwt.verify(token, Config.JWT_SECRET_KEY);
      if (typeof decoded !== "object") {
        throw new AppError(401, "unauthorized", "invalid_token");
      }
      if (!decoded.sub) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }

      // Check user for existence.
      user = await prisma.user.findFirst({
        where: { id: decoded.sub, isActive: true },
        select: {
          id: true,
          fname: true,
          lname: true,
          phone: true,
          email: true,
          role: true,
          blockedUntil: true,
          permissions: true,
          createdAt: true,
          updatedAt: true,
          pwdVersion: true,
        },
      });
      if (!user) throw new AppError(401, "unauthorized", "invalid_token");

      if (user.pwdVersion !== decoded.ver) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }

      // Check for blocks.
      const blockedUntil = user.blockedUntil;
      if (blockedUntil && Date.now() < blockedUntil.getTime()) {
        throw new AppError(423, "user_temporarily_blocked", { blocked_until: blockedUntil });
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError(401, "unauthorized", "token_expired");
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError(401, "unauthorized", "invalid_token");
      }
      throw new AppError(401, "unauthorized", "jwt_error");
    }

    // Update last seans.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastSeans: new Date(),
        updatedAt: user.updatedAt,
      },
    });

    const { pwdVersion, ...cleanData } = user;
    req.user = cleanData;
    next();
  } catch (error) {
    next(localErrorHandler(error));
  }
};
