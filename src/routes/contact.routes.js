const contactController = require("../controllers/contact.controller");
const { contactCreatValidatorMiddleware } = require("../middlewares/validators/contact/contactCreatValidatorMiddleware");

const contactRouter = require("express").Router();

contactRouter.post("/", contactCreatValidatorMiddleware, contactController.create);

module.exports = { contactRouter };
