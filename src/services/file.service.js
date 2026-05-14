const fs = require("fs");
const { getFile } = require("../utils/s3");

class fileService {
  async _unlinkFile(file) {
    try {
      await fs.promises.unlink(file.path);
    } catch (error) {
      console.log(error);
    }
  }

  async unlinkFiles(files) {
    if (files) {
      if (Array.isArray(files) && files.length) {
        await Promise.all(files.map(async (file) => await this._unlinkFile(file)));
      } else if (typeof files === "object") this._unlinkFile(files);
    }
  }

  async getByKey(key) {
    try {
      return getFile(key);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new fileService();
