const bcrypt = require("bcrypt");

exports.hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  return hash;
};

exports.comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
