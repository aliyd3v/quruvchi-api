const fs = require("fs/promises");
const sharp = require("sharp");
const path = require("path");
const convert = require("heic-convert");

exports.imageConverter = async (file) => {
  try {
    const ext = path.extname(file.filename).toLowerCase();

    if (ext === ".heic" || ext === ".heif") {
      const heicBuffer = await fs.readFile(file.path);

      const jpegBuffer = await convert({
        buffer: heicBuffer,
        format: "JPEG",
        quality: 0.9,
      });

      const newExt = ".webp";
      const newFilename = path.parse(file.filename).name + newExt;
      const newPath = path.join(file.destination, newFilename);

      await sharp(jpegBuffer)
        .rotate()
        .resize({
          width: 1920,
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toFile(newPath);

      const stat = await fs.stat(newPath);

      try {
        await fs.unlink(file.path);
      } catch (error) {
        console.log(error);
      }

      file.filename = newFilename;
      file.path = newPath;
      file.mimetype = "image/webp";
      file.size = stat.size;
      file.originalname = path.parse(file.originalname).name + newExt;
    }
    return;
  } catch (error) {
    throw error;
  }
};
