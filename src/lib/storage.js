const fs = require("fs/promises");
const { imageConverter } = require("../utils/imageConverter");
const { APP_URL } = require("../config");
const path = require("path");

class Storage {
  async save(file) {
    try {
      await imageConverter(file);

      const oldPath = path.join(__dirname, "..", "..", "uploads", file.filename);
      const newPath = path.join(__dirname, "..", "..", "storage", file.filename);

      await fs.rename(oldPath, newPath);

      const url = APP_URL + "/file/" + file.filename;

      const result = {
        originalname: file.originalname,
        filename: file.filename,
        filesize: file.size,
        mimeType: file.mimetype,
        url,
      };

      return result;
    } catch (error) {
      throw error;
    }
  }

  async saveMany(files) {
    try {
      return await Promise.all(files.map((f) => this.save(f)));
    } catch (error) {
      throw error;
    }
  }

  async getFile(key) {
    try {
      const filepath = path.join(__dirname, "..", "..", "storage", key);
      return await s3.send(command);
    } catch (error) {
      throw error;
    }
  }

  async delete(filename) {
    try {
      const p = path.join(__dirname, "..", "..", "storage", filename);
      await fs.unlink(p);

      return;
    } catch (error) {
      console.log(error);
    }
  }

  async deleteMany(filenames) {
    try {
      return await Promise.all(filenames.map((filename) => this.delete(filename)));
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new Storage();
