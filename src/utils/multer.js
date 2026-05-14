const fs = require("fs");
const path = require("path");
const multer = require("multer");

function random6X() {
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
}

if (!fs.existsSync(path.join(__dirname, "uploads"))) fs.mkdirSync(path.join(__dirname, "uploads"));

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_req, file, cb) => cb(null, Date.now() + "_" + random6X() + path.extname(file.originalname).toLowerCase()),
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

module.exports = upload;
