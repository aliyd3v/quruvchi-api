const crypto = require("crypto");

exports.sha256 = (str) => {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
};
