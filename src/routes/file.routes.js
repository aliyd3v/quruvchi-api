const fileController = require("../controllers/file.controller");

const fileRouter = require("express").Router().get("/:key", fileController.getByKey);

module.exports = { fileRouter };
