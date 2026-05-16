const { createServer } = require("http");
const express = require("express");
const cors = require("cors");
const Config = require("./config");
const Router = require("./router");
const { responseFormatter } = require("./middlewares/timezone");
const { cronJobs } = require("./utils/cron");
const { mkdir } = require("fs/promises");

class App {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.setupDirs();
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
    // .use(express.static("storage"));
  }

  routes() {
    Router(this.app);
  }

  cron() {
    cronJobs();
  }

  async setupDirs() {
    try {
      await mkdir("storage", { recursive: true });
      console.log("Setup directories is completed");
    } catch (error) {
      console.log(error);
    }
  }

  listen() {
    this.server.listen(Config.PORT, () => console.log("Server running on port " + Config.PORT));
  }
}

module.exports = new App();
