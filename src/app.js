const { createServer } = require("http");
const express = require("express");
const cors = require("cors");
const Config = require("./config");
const Router = require("./router");
const { responseFormatter } = require("./middlewares/timezone");
const { cronJobs } = require("./utils/cron");

class App {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.middlewares();
    this.routes();
    this.cron();
    this.listen();
  }

  middlewares() {
    this.app
      .use(express.json())
      .use(express.urlencoded({ extended: true }))
      .use(cors())
      .use(responseFormatter);
  }

  routes() {
    Router(this.app);
  }

  cron() {
    cronJobs();
  }

  listen() {
    this.server.listen(Config.PORT, () => console.log("Server running on port " + Config.PORT));
  }
}

module.exports = new App();
