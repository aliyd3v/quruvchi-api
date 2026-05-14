const crypto = require("crypto");
const Config = require("../config");

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function encrypt(text) {
  const key = Buffer.from(Config.CRYPTO_SECRET_KEY, "base64");
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(enc) {
  const key = Buffer.from(Config.CRYPTO_SECRET_KEY, "base64");
  const data = Buffer.from(enc, "base64");
  const iv = data.slice(0, IV_LEN);
  const tag = data.slice(IV_LEN, IV_LEN + 16);
  const encrypted = data.slice(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = { encrypt, decrypt };
