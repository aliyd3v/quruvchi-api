const permissionController = require("../controllers/permission.controller");
const { Role } = require("../generated/prisma");
const { checkRole } = require("../middlewares/checkRole");
const { checkToken } = require("../middlewares/checkToken");

const permissionRouter = require("express").Router();

permissionRouter.get("/", checkToken, checkRole(), permissionController.getAll);

module.exports = { permissionRouter };
