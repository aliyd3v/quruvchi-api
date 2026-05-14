const permissionController = require("../controllers/permission.controller");
const { Role } = require("../generated/prisma");
const { checkRoleMiddleware } = require("../middlewares/checkRoleMiddleware");
const { checkTokenMiddleware } = require("../middlewares/checkTokenMiddleware");

const permissionRouter = require("express").Router();

permissionRouter.get("/", checkTokenMiddleware, checkRoleMiddleware(), permissionController.getAll);

module.exports = { permissionRouter };
